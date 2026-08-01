/**
 * lib/gameEngine.js
 *
 * Pure game-state transition logic for football-countdown.
 * Evaluates player guesses against session state and returns the next state
 * and one of the 7 explicit result cases.
 *
 * This module is pure (no side effects, no I/O) and does not rely on any
 * server-side memory between function calls.
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
 * Check if a player identity exists in EITHER player's burned list.
 * Matches on canonical profileUrl OR normalized name.
 *
 * @param {object} sessionState - Current session state
 * @param {object|string} player - Player candidate to check
 * @returns {boolean} True if player is burned by EITHER player 1 or player 2
 */
function isPlayerBurned(sessionState, player) {
  const targetId = getCanonicalPlayerId(player);
  const targetName = getNormalizedName(player);

  if (!targetId && !targetName) return false;

  const p1List = sessionState.player1BurnedList || [];
  const p2List = sessionState.player2BurnedList || [];
  const allBurned = [...p1List, ...p2List];

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
 * @param {object} [options]
 * @returns {object} Initial session state
 */
function createInitialState(options = {}) {
  return {
    balance: typeof options.startingBalance === 'number' ? options.startingBalance : 700,
    players: options.players || ['Player 1', 'Player 2'],
    currentPlayerIndex: 0,
    player1BurnedList: [],
    player2BurnedList: [],
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
 *   1. TIME_UP: timer expired before submission -> turn lost, balance unchanged.
 *   2. ALREADY_BURNED: player already in p1 or p2 burned list -> turn retained, balance unchanged.
 *   3. NEEDS_DISAMBIGUATION: multiple candidate choices -> user must select one.
 *   4. NOT_ASSOCIATED: player has 0 rows for selected club -> turn retained, balance unchanged.
 *   5. BUST: stat value > remaining balance -> turn lost, balance unchanged.
 *   6. WIN: balance - statValue === 0 -> game ends, current player wins.
 *   7. SUCCESS: statValue <= remaining balance -> balance updated, player burned, turn passed.
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

  // Case 2: ALREADY_BURNED (Pre-check against both burned lists)
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

  // Handle statutory / stat evaluation (SUCCESS, BUST, WIN)
  if (turnData.statStatus === 'SUCCESS' && typeof turnData.statValue === 'number') {
    const statValue = turnData.statValue;
    const currentBalance = state.balance;

    // Case 5: BUST (goals > remaining balance)
    if (statValue > currentBalance) {
      const nextTurnState = {
        ...state,
        currentPlayerIndex: getNextPlayerIndex(state)
      };
      return {
        resultCase: 'BUST',
        newState: nextTurnState,
        message: `Bust! Stat value (${statValue}) exceeds remaining balance (${currentBalance}).`
      };
    }

    const newBalance = currentBalance - statValue;

    // Add player to active player's burned list
    const burnedPlayerEntry = turnData.player || { name: 'Unknown' };
    const p1List = [...(state.player1BurnedList || [])];
    const p2List = [...(state.player2BurnedList || [])];

    if (state.currentPlayerIndex === 0) {
      p1List.push(burnedPlayerEntry);
    } else {
      p2List.push(burnedPlayerEntry);
    }

    // Case 6: WIN (balance hits EXACTLY 0)
    if (newBalance === 0) {
      const activePlayerName = (state.players && state.players[state.currentPlayerIndex]) || `Player ${state.currentPlayerIndex + 1}`;
      const winState = {
        ...state,
        balance: 0,
        player1BurnedList: p1List,
        player2BurnedList: p2List,
        isGameOver: true,
        winner: activePlayerName
      };
      return {
        resultCase: 'WIN',
        newState: winState,
        message: `Exactly zero! ${activePlayerName} wins!`
      };
    }

    // Case 7: SUCCESS (newBalance > 0)
    const successState = {
      ...state,
      balance: newBalance,
      player1BurnedList: p1List,
      player2BurnedList: p2List,
      isGameOver: false,
      currentPlayerIndex: getNextPlayerIndex(state)
    };

    return {
      resultCase: 'SUCCESS',
      newState: successState,
      statDeducted: statValue,
      message: `Success! Subtracted ${statValue}. New balance: ${newBalance}.`
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
 * Process a manual player submission (UNKNWON_PLAYER flow).
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

  // Check ALREADY_BURNED
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

