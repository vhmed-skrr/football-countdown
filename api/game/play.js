/**
 * api/game/play.js
 * POST /api/game/play
 *
 * Receives the current session state + player search string or selected player.
 * Wires together playerResolver (A1), scraper (A2), and gameEngine (A3).
 *
 * The backend is fully stateless — all session state is passed in by the client
 * and returned updated in the response.
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

    let targetPlayer = null;

    // Step B & C: Determine target player (resubmitted selectedPlayer vs raw query resolution)
    if (body.selectedPlayer && typeof body.selectedPlayer === 'object' && body.selectedPlayer.name) {
      // Direct resubmission from disambiguation selection -> skip resolver to prevent loop
      targetPlayer = body.selectedPlayer;
    } else if (body.playerQuery && typeof body.playerQuery === 'string') {
      const query = body.playerQuery.trim();
      if (!query) {
        return res.status(400).json({ error: 'playerQuery cannot be empty' });
      }

      // Call playerResolver (A1)
      const resolveResult = await resolvePlayer(query);

      if (resolveResult.type === 'NOT_FOUND') {
        // Player name does not exist on FBref
        const notFoundResult = evaluateTurn(sessionState, { statStatus: 'NOT_ASSOCIATED' });
        return res.status(200).json({
          resultCase: 'NOT_ASSOCIATED',
          sessionState: notFoundResult.newState,
          message: `No football player found matching "${query}".`
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

        // Ambiguous search -> return NEEDS_DISAMBIGUATION (do NOT proceed to scrape)
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

    // Step D: Pre-check ALREADY_BURNED against both burned lists before scraping
    if (isPlayerBurned(sessionState, targetPlayer)) {
      const burnedResult = evaluateTurn(sessionState, { player: targetPlayer });
      return res.status(200).json({
        resultCase: 'ALREADY_BURNED',
        sessionState: burnedResult.newState,
        player: targetPlayer,
        message: burnedResult.message
      });
    }

    // Step E: Fetch stats via scraper (A2) for target club/league/category
    const club = sessionState.club || 'Liverpool';
    const league = sessionState.league || 'Premier League';
    const category = sessionState.category || 'goals';
    const profileRef = targetPlayer.profileUrl || targetPlayer.name;

    const scrapeResult = await fetchPlayerStats(profileRef, club, league, category);

    // Step F: Evaluate result via gameEngine (A3)
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
