/**
 * api/game/setup.js
 * POST /api/game/setup
 *
 * Initialises a new game session state and returns it to the client.
 * The client is responsible for storing this state and forwarding it
 * on every subsequent request to /api/game/play.
 */

'use strict';

const { createInitialState } = require('../../lib/gameEngine');

module.exports = async function handler(req, res) {
  // Enforce POST method
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

    const league = body.league || 'Premier League';
    const club = body.club || 'Liverpool';
    const numPlayers = parseInt(body.num_players, 10) || 2;

    // Validate player_names array (must contain real display names)
    let playerNames = Array.isArray(body.player_names) ? body.player_names.filter(Boolean) : [];
    if (playerNames.length === 0) {
      playerNames = Array.from({ length: numPlayers }, (_, i) => `Player ${i + 1}`);
    }

    const startingBalance = parseInt(body.starting_balance, 10) || 700;
    const category = body.category || 'goals';

    const sessionState = createInitialState({
      startingBalance,
      players: playerNames,
      league,
      club,
      category,
    });

    return res.status(200).json({
      success: true,
      sessionState,
    });
  } catch (err) {
    return res.status(400).json({
      error: 'Invalid request body or initialization parameters',
      details: err.message,
    });
  }
};
