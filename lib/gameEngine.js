/**
 * lib/gameEngine.js
 *
 * Pure game-state transition logic for football-countdown.
 * Evaluates player guesses against session state and returns the next state
 * and one of the 7 explicit result cases.
 *
 * This module is pure (no side effects, no I/O) and does not rely on any
 * server-side memory between function calls.
 *
 * Balance model: each player has their OWN independent balance. Only the active
 * player's balance is affected on their turn. The first player whose balance
 * reaches exactly 0 wins immediately — the game does not wait for other
 * players to reach 0 as well.
 */

'use strict';

/**
 * Normalise player identity for canonical comparison.
 * Compares by FBref profileUrl if available, falling back to normalised name.
 *
 * @param {object|string} player - Player candidate object or identity string
 * @returns {string}
 */
function getCanonicalPlayerId(player) {
  if (!player) return '';
  if (typeof player === 'string') {
    return player.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  }
  if (player.profileUrl) {
    return player.profileUrl.trim().toLowerCase();
  }
  if (player.name) {
    return player.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  }
  return '';
}

/**
 * Extract normalized name string from player object or string.
 *
 * @param {object|string} player
 * @returns {string}
 */
function getNormalizedName(player) {
  if (!player) return '';
  const rawName = typeof player === 'string' ? player : (player.name || '');
  return rawName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

/**
 * Check if a player identity exists in ANY player's burned list.
 * Matches on canonical profileUrl OR normalized name.
 * The cross-player ALREADY_BURNED rule: a player burned by ANY participant
 * is rejected for ALL participants — this check is intentionally global.
 *
 * @param {object} sessionState - Current session state
 * @param {object|string} player - Player candidate to check
 * @returns {boolean} True if player is burned by any player
 */
function isPlayerBurned(sessionState, player) {
  const targetId = getCanonicalPlayerId(player);
  const targetName = getNormalizedName(player);

  if (!targetId && !targetName) return false;

  // Gather all burned entries across every player's burned list
  const playerData = sessionState.playerData || {};
  const allBurned = Object.values(playerData).flatMap(pd => pd.burnedList || []);

  return allBurned.some(b => {
    const bId = getCanonicalPlayerId(b);
    const bName = getNormalizedName(b);

    if (targetId && bId && targetId === bId) return true;
    if (targetName && bName && targetName === bName) return true;
    return false;
  });
}

/**
 * Helper to advance turn to the next player.
 *
 * @param {object} state
 * @returns {number} Next player index
 */
function getNextPlayerIndex(state) {
  const totalPlayers = (state.players && state.players.length) || 2;
  return (state.currentPlayerIndex + 1) % totalPlayers;
}

/**
 * Create a fresh, initial session state object.
 *
 * Per-player balance model:
 *   state.playerData = {
 *     0: { balance: 700, burnedList: [] },
 *     1: { balance: 700, burnedList: [] },
 *     ...
 *   }
 *
 * @param {object} [options]
 * @param {number} [options.startingBalance=700]
 * @param {string[]} [options.players]
 * @param {string} [options.league]
 * @param {string} [options.club]
 * @param {string} [options.category]
 * @returns {object} Initial session state
 */
function createInitialState(options = {}) {
  const startingBalance = typeof options.startingBalance === 'number' ? options.startingBalance : 700;
  const playerNames = options.players || ['Player 1', 'Player 2'];

  // Build per-player data keyed by player index (stored as string keys in JSON)
  const playerData = {};
  for (let i = 0; i < playerNames.length; i++) {
    playerData[i] = {
      balance: startingBalance,
      burnedList: []
    };
  }

  return {
    playerData,
    players: playerNames,
    currentPlayerIndex: 0,
    league: options.league || null,
    club: options.club || null,
    category: options.category || 'goals',
    isGameOver: false,
    winner: null,
  };
}

/**
 * Evaluate a turn submission against the current session state.
 *
 * @param {object} sessionState - Current session state (immutable input)
 * @param {object} turnData - Information about the turn submission:
 *   {
 *     timerExpired?: boolean,
 *     player?: object,              // Resolved player candidate { name, profileUrl, ... }
 *     candidates?: object[],        // Candidate list if disambiguation needed
 *     needsDisambiguation?: boolean,// True if partial match returned multiple choices
 *     statStatus?: string,          // 'SUCCESS' | 'NOT_ASSOCIATED' | 'ERROR'
 *     statValue?: number            // Aggregated goals/stats value
 *   }
 * @returns {{ resultCase: string, newState: object, message?: string, candidates?: object[] }}
 *
 * Result Cases:
 *   1. TIME_UP: timer expired before submission -> turn lost, current player's balance unchanged.
 *   2. ALREADY_BURNED: player already in any burned list -> turn retained, balance unchanged.
 *   3. NEEDS_DISAMBIGUATION: multiple candidate choices -> user must select one.
 *   4. NOT_ASSOCIATED: player has 0 rows for selected club -> turn retained, balance unchanged.
 *   5. BUST: stat value > current player's remaining balance -> turn lost, balance unchanged.
 *   6. WIN: current player's balance - statValue === 0 -> that player wins immediately, game ends.
 *   7. SUCCESS: statValue <= current player's remaining balance -> current player's balance updated,
 *              player burned, turn passed.
 *   8. UNKNOWN_PLAYER: searched name not in static dataset -> triggers manual add flow.
 */
function evaluateTurn(sessionState, turnData = {}) {
  // Clone current state to ensure immutability
  const state = JSON.parse(JSON.stringify(sessionState));

  // Case 1: TIME_UP
  if (turnData.timerExpired) {
    const nextTurnState = {
      ...state,
      currentPlayerIndex: getNextPlayerIndex(state)
    };
    return {
      resultCase: 'TIME_UP',
      newState: nextTurnState,
      message: "Time's up! Your turn is lost."
    };
  }

  // Case 2: ALREADY_BURNED (Pre-check against ALL players' burned lists)
  if (turnData.player && isPlayerBurned(state, turnData.player)) {
    return {
      resultCase: 'ALREADY_BURNED',
      newState: state, // turn retained
      message: `Player "${turnData.player.name || 'Selected Player'}" is already burned in this game!`
    };
  }

  // Case 3: NEEDS_DISAMBIGUATION
  if (turnData.needsDisambiguation && Array.isArray(turnData.candidates) && turnData.candidates.length > 1) {
    return {
      resultCase: 'NEEDS_DISAMBIGUATION',
      newState: state,
      candidates: turnData.candidates,
      message: 'Multiple player matches found. Please select one.'
    };
  }

  // Case 4: NOT_ASSOCIATED (Zero rows for selected club)
  if (turnData.statStatus === 'NOT_ASSOCIATED') {
    return {
      resultCase: 'NOT_ASSOCIATED',
      newState: state, // turn retained, balance unchanged
      message: 'This player has no record for the selected club in this league.'
    };
  }

  // Handle stat evaluation (SUCCESS, BUST, WIN)
  if (turnData.statStatus === 'SUCCESS' && typeof turnData.statValue === 'number') {
    const statValue = turnData.statValue;
    const currentIdx = state.currentPlayerIndex;

    // Ensure playerData exists and is well-formed
    if (!state.playerData || !state.playerData[currentIdx]) {
      return {
        resultCase: 'ERROR',
        newState: state,
        message: `Missing playerData for player index ${currentIdx}.`
      };
    }

    const currentPlayerBalance = state.playerData[currentIdx].balance;

    // Case 5: BUST (goals > current player's remaining balance)
    if (statValue > currentPlayerBalance) {
      const nextTurnState = {
        ...state,
        currentPlayerIndex: getNextPlayerIndex(state)
      };
      return {
        resultCase: 'BUST',
        newState: nextTurnState,
        message: `Bust! Stat value (${statValue}) exceeds your remaining balance (${currentPlayerBalance}).`
      };
    }

    const newBalance = currentPlayerBalance - statValue;

    // Add player to the current (active) player's burned list
    const burnedPlayerEntry = turnData.player || { name: 'Unknown' };
    const updatedPlayerData = JSON.parse(JSON.stringify(state.playerData));
    updatedPlayerData[currentIdx].burnedList.push(burnedPlayerEntry);

    // Case 6: WIN (current player's balance hits EXACTLY 0)
    if (newBalance === 0) {
      const activePlayerName = (state.players && state.players[currentIdx]) || `Player ${currentIdx + 1}`;
      updatedPlayerData[currentIdx].balance = 0;
      const winState = {
        ...state,
        playerData: updatedPlayerData,
        isGameOver: true,
        winner: activePlayerName
      };
      return {
        resultCase: 'WIN',
        newState: winState,
        message: `Exactly zero! ${activePlayerName} wins!`
      };
    }

    // Case 7: SUCCESS (newBalance > 0) — only this player's balance changes
    updatedPlayerData[currentIdx].balance = newBalance;
    const successState = {
      ...state,
      playerData: updatedPlayerData,
      isGameOver: false,
      currentPlayerIndex: getNextPlayerIndex(state)
    };

    return {
      resultCase: 'SUCCESS',
      newState: successState,
      statDeducted: statValue,
      message: `Success! Subtracted ${statValue}. Your new balance: ${newBalance}.`
    };
  }

  // Fallback / General Error
  return {
    resultCase: 'ERROR',
    newState: state,
    message: turnData.message || 'Unable to evaluate turn.'
  };
}

/**
 * Process a manual player submission (UNKNOWN_PLAYER flow).
 *
 * @param {object} sessionState - Current session state (immutable input)
 * @param {string} playerName - Player name typed by user
 * @param {number|string} goalsScored - Non-negative integer goals scored
 * @returns {{ resultCase: string, newState: object, message?: string, statDeducted?: number, player?: object }}
 */
function submitManualPlayer(sessionState, playerName, goalsScored) {
  const state = JSON.parse(JSON.stringify(sessionState));
  const cleanName = (playerName || '').trim();

  if (!cleanName) {
    return {
      resultCase: 'ERROR',
      newState: state,
      message: 'Player name cannot be empty.'
    };
  }

  // Validate goalsScored is a non-negative integer
  let numericGoals = null;
  if (typeof goalsScored === 'number') {
    if (Number.isInteger(goalsScored) && goalsScored >= 0) {
      numericGoals = goalsScored;
    }
  } else if (typeof goalsScored === 'string') {
    const trimmed = goalsScored.trim();
    if (/^\d+$/.test(trimmed)) {
      numericGoals = parseInt(trimmed, 10);
    }
  }

  if (numericGoals === null || isNaN(numericGoals)) {
    return {
      resultCase: 'ERROR',
      newState: state,
      message: 'Goals scored must be a non-negative integer.'
    };
  }

  const manualPlayerObj = { name: cleanName, isManual: true };

  // Check ALREADY_BURNED (cross-player check)
  if (isPlayerBurned(state, manualPlayerObj)) {
    return {
      resultCase: 'ALREADY_BURNED',
      newState: state,
      player: manualPlayerObj,
      message: `Player "${cleanName}" is already burned in this game!`
    };
  }

  // Use evaluateTurn with statStatus = 'SUCCESS' & statValue = numericGoals
  const turnEval = evaluateTurn(state, {
    player: manualPlayerObj,
    statStatus: 'SUCCESS',
    statValue: numericGoals
  });

  return {
    ...turnEval,
    player: manualPlayerObj
  };
}

module.exports = {
  createInitialState,
  isPlayerBurned,
  evaluateTurn,
  submitManualPlayer,
  getCanonicalPlayerId,
  getNormalizedName
};
