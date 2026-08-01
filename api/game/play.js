/**
 * api/game/play.js
 * POST /api/game/play
 *
 * Receives the current session state + player search string or selected player.
 * Wires together playerResolver (A1), scraper (A2), and gameEngine (A3).
 *
 * The backend is fully stateless — all session state is passed in by the client
 * and returned updated in the response.
 *
 * Data flow (new static-dataset architecture):
 *   1. resolvePlayer(query, clubSlug) — fuzzy-matches query against the club's
 *      static JSON dataset in public/data/players/<clubSlug>.json
 *   2. fetchPlayerStats(playerRecord, leagueName) — looks up goals_by_competition
 *      directly from the already-loaded player record; no HTTP request.
 *   3. evaluateTurn() — pure game-state transition as before.
 */

'use strict';

const { resolvePlayer } = require('../../lib/playerResolver');
const { fetchPlayerStats } = require('../../lib/scraper');
const { evaluateTurn, isPlayerBurned } = require('../../lib/gameEngine');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const sessionState = body.sessionState;

    if (!sessionState || typeof sessionState !== 'object') {
      return res.status(400).json({ error: 'Missing or invalid sessionState in request body' });
    }

    // Step A: Timer expired check
    if (body.timerExpired === true) {
      const result = evaluateTurn(sessionState, { timerExpired: true });
      return res.status(200).json({
        resultCase: result.resultCase,
        sessionState: result.newState,
        message: result.message,
      });
    }

    // Derive the club slug from session state for dataset lookup.
    // Convention: lowercase the club name and replace spaces with hyphens
    // (e.g. "Liverpool" → "liverpool", "Man City" → "man-city").
    const club = sessionState.club || '';
    const clubSlug = club.toLowerCase().replace(/\s+/g, '-');
    const league = sessionState.league || 'Premier League';
    const category = sessionState.category || 'goals';

    let targetPlayer = null;

    // Step B & C: Determine target player (resubmitted selectedPlayer vs raw query resolution)
    if (body.selectedPlayer && typeof body.selectedPlayer === 'object' && body.selectedPlayer.name) {
      // Direct resubmission from disambiguation selection — skip resolver to prevent loop
      targetPlayer = body.selectedPlayer;
    } else if (body.playerQuery && typeof body.playerQuery === 'string') {
      const query = body.playerQuery.trim();
      if (!query) {
        return res.status(400).json({ error: 'playerQuery cannot be empty' });
      }

      // Call playerResolver — looks up the club's static dataset
      const resolveResult = await resolvePlayer(query, clubSlug);

      if (resolveResult.type === 'UNKNOWN_PLAYER') {
        // No match found in the static dataset for this club.
        // Return NOT_ASSOCIATED (turn retained, balance unchanged) with a clear message.
        // NOTE: Future prompt will implement a manual-addition flow for this case.
        return res.status(200).json({
          resultCase: 'NOT_ASSOCIATED',
          sessionState,
          message: `No player matching "${query}" found in the ${club} dataset. ` +
                   `Check the spelling or try a different name.`
        });
      }

      if (resolveResult.type === 'ERROR') {
        return res.status(200).json({
          resultCase: 'ERROR',
          sessionState,
          message: resolveResult.message || 'Error resolving player name'
        });
      }

      if (resolveResult.type === 'FOUND') {
        const candidates = resolveResult.players || [];

        // Ambiguous search → return NEEDS_DISAMBIGUATION (do NOT proceed to scrape)
        if (candidates.length > 1) {
          const disambigResult = evaluateTurn(sessionState, {
            needsDisambiguation: true,
            candidates
          });

          return res.status(200).json({
            resultCase: 'NEEDS_DISAMBIGUATION',
            candidates: disambigResult.candidates,
            sessionState: disambigResult.newState,
            message: disambigResult.message
          });
        }

        if (candidates.length === 1) {
          targetPlayer = candidates[0];
        }
      }
    } else {
      return res.status(400).json({ error: 'Must provide either playerQuery or selectedPlayer' });
    }

    if (!targetPlayer) {
      return res.status(200).json({
        resultCase: 'NOT_ASSOCIATED',
        sessionState,
        message: 'Could not resolve player identity.'
      });
    }

    // Step D: Pre-check ALREADY_BURNED against both burned lists before fetching stats
    if (isPlayerBurned(sessionState, targetPlayer)) {
      const burnedResult = evaluateTurn(sessionState, { player: targetPlayer });
      return res.status(200).json({
        resultCase: 'ALREADY_BURNED',
        sessionState: burnedResult.newState,
        player: targetPlayer,
        message: burnedResult.message
      });
    }

    // Step E: Fetch stats from the static dataset player record (no HTTP request)
    // targetPlayer is a full player record from the dataset, including goals_by_competition.
    const scrapeResult = await fetchPlayerStats(targetPlayer, league);

    // Step F: Evaluate result via gameEngine
    const turnEvaluation = evaluateTurn(sessionState, {
      player: targetPlayer,
      statStatus: scrapeResult.status,
      statValue: scrapeResult.value,
      message: scrapeResult.message
    });

    return res.status(200).json({
      resultCase: turnEvaluation.resultCase,
      sessionState: turnEvaluation.newState,
      statDeducted: turnEvaluation.statDeducted,
      message: turnEvaluation.message,
      player: targetPlayer
    });

  } catch (err) {
    return res.status(500).json({
      resultCase: 'ERROR',
      sessionState: req.body?.sessionState || null,
      message: `Internal server error: ${err.message}`
    });
  }
};
