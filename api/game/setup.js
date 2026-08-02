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
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS preflight request
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Enforce POST method
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST', 'OPTIONS']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

    // Validate num_players (must be integer between 2 and 8)
    const rawNumPlayers = body.num_players !== undefined ? body.num_players : 2;
    const numPlayers = Number(rawNumPlayers);
    if (!Number.isInteger(numPlayers) || numPlayers < 2 || numPlayers > 8) {
      return res.status(400).json({ error: 'num_players must be an integer between 2 and 8' });
    }

    // Validate starting_balance (must be positive integer > 0)
    const rawStartingBalance = body.starting_balance !== undefined ? body.starting_balance : 700;
    const startingBalance = Number(rawStartingBalance);
    if (!Number.isInteger(startingBalance) || startingBalance <= 0) {
      return res.status(400).json({ error: 'starting_balance must be a positive integer greater than zero' });
    }

    const league = body.league || 'Premier League';
    const club = body.club || 'Liverpool';

    // Validate player_names array (must contain real display names)
    let playerNames = Array.isArray(body.player_names) ? body.player_names.filter(Boolean) : [];
    if (playerNames.length === 0) {
      playerNames = Array.from({ length: numPlayers }, (_, i) => `Player ${i + 1}`);
    }

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
