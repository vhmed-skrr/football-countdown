/**
 * test-manual-player.js
 * Verification test script for UNKNOWN_PLAYER manual player addition feature.
 */

'use strict';

const assert = require('assert');
const { createInitialState, submitManualPlayer, isPlayerBurned } = require('./lib/gameEngine');
const { resolvePlayer } = require('./lib/playerResolver');
const handler = require('./api/game/play');

// Helper to mock HTTP res object
function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(key, val) {
      this.headers[key] = val;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
}

async function runTests() {
  console.log('--- Testing UNKNOWN_PLAYER & Manual Submission ---\n');

  // Test 1: Resolver returns UNKNOWN_PLAYER for unlisted player name
  const resolveRes = await resolvePlayer('Random Unlisted Player Name', 'liverpool');
  assert.strictEqual(resolveRes.type, 'UNKNOWN_PLAYER', 'Resolver should return UNKNOWN_PLAYER for unlisted player');
  console.log('✅ Test 1 Passed: resolvePlayer returns UNKNOWN_PLAYER for unlisted player');

  // Test 2: submitManualPlayer validation
  const state = createInitialState({ startingBalance: 100, club: 'Liverpool', league: 'Premier League' });

  // 2a. Reject non-numeric input
  const invalidTextRes = submitManualPlayer(state, 'John Doe', 'abc');
  assert.strictEqual(invalidTextRes.resultCase, 'ERROR');
  console.log('✅ Test 2a Passed: Invalid non-numeric goals input rejected');

  // 2b. Reject negative input
  const invalidNegRes = submitManualPlayer(state, 'John Doe', -15);
  assert.strictEqual(invalidNegRes.resultCase, 'ERROR');
  console.log('✅ Test 2b Passed: Negative goals input rejected');

  // 2c. Reject empty name
  const invalidNameRes = submitManualPlayer(state, '', 10);
  assert.strictEqual(invalidNameRes.resultCase, 'ERROR');
  console.log('✅ Test 2c Passed: Empty player name rejected');

  // Test 3: submitManualPlayer SUCCESS
  const validSuccessRes = submitManualPlayer(state, 'John Doe', 25);
  assert.strictEqual(validSuccessRes.resultCase, 'SUCCESS');
  assert.strictEqual(validSuccessRes.newState.playerData[0].balance, 75);
  assert.strictEqual(validSuccessRes.newState.currentPlayerIndex, 1);
  assert.strictEqual(validSuccessRes.newState.playerData[0].burnedList.length, 1);
  assert.strictEqual(validSuccessRes.newState.playerData[0].burnedList[0].name, 'John Doe');
  console.log('✅ Test 3 Passed: Valid manual entry deducts balance, burns player, and advances turn');

  // Test 4: ALREADY_BURNED check on manual entry
  const burnedCheckRes = submitManualPlayer(validSuccessRes.newState, 'John Doe', 10);
  assert.strictEqual(burnedCheckRes.resultCase, 'ALREADY_BURNED');
  console.log('✅ Test 4 Passed: Repeated manual submission returns ALREADY_BURNED');

  // Test 5: submitManualPlayer BUST
  const bustRes = submitManualPlayer(state, 'Big Scorer', 150);
  assert.strictEqual(bustRes.resultCase, 'BUST');
  assert.strictEqual(bustRes.newState.playerData[0].balance, 100);
  assert.strictEqual(bustRes.newState.currentPlayerIndex, 1);
  console.log('✅ Test 5 Passed: Manual submission > balance returns BUST');

  // Test 6: submitManualPlayer WIN
  const winRes = submitManualPlayer(state, 'Exact Finisher', 100);
  assert.strictEqual(winRes.resultCase, 'WIN');
  assert.strictEqual(winRes.newState.playerData[0].balance, 0);
  assert.strictEqual(winRes.newState.isGameOver, true);
  assert.strictEqual(winRes.newState.winner, 'Player 1');
  console.log('✅ Test 6 Passed: Manual submission matching balance returns WIN');

  // Test 7: API Handler Integration test for UNKNOWN_PLAYER & manualEntry
  // 7a: playerQuery returning UNKNOWN_PLAYER
  const req1 = {
    method: 'POST',
    body: {
      sessionState: state,
      playerQuery: 'Non Existent Player'
    }
  };
  const res1 = createMockRes();
  await handler(req1, res1);
  assert.strictEqual(res1.body.resultCase, 'UNKNOWN_PLAYER');
  assert.strictEqual(res1.body.playerName, 'Non Existent Player');
  console.log('✅ Test 7a Passed: API play returns UNKNOWN_PLAYER for unlisted search');

  // 7b: manualEntry execution via API
  const req2 = {
    method: 'POST',
    body: {
      sessionState: state,
      manualEntry: true,
      playerName: 'Custom Legend',
      goalsScored: 40
    }
  };
  const res2 = createMockRes();
  await handler(req2, res2);
  assert.strictEqual(res2.body.resultCase, 'SUCCESS');
  assert.strictEqual(res2.body.statDeducted, 40);
  assert.strictEqual(res2.body.sessionState.playerData[0].balance, 60);
  console.log('✅ Test 7b Passed: API play manualEntry successfully processes and deducts balance');

  console.log('\nAll UNKNOWN_PLAYER & manual player submission tests passed successfully!');
}

runTests();
