/**
 * test-gameEngine.js
 *
 * Unit test suite for lib/gameEngine.js.
 * Run with: node test-gameEngine.js
 *
 * Tests all 7 result cases:
 *   1. SUCCESS: deduction < balance -> balance reduced, burned list updated, turn passed
 *   2. BUST: deduction > balance -> balance unchanged, turn passed
 *   3. ALREADY_BURNED: player in P1 or P2 list -> rejected immediately, balance & turn unchanged
 *   4. TIME_UP: timer expired -> turn lost, balance unchanged
 *   5. WIN: deduction === balance -> balance 0, isGameOver true, winner set
 *   6. NOT_ASSOCIATED: 0 club records -> turn retained, balance unchanged
 *   7. NEEDS_DISAMBIGUATION: multiple candidates -> candidates returned for selection
 *
 * Boundary Conditions Tested:
 *   - goals === balance -> WIN
 *   - goals === balance + 1 -> BUST
 *   - goals === balance - 1 -> SUCCESS
 *   - 0 goals -> SUCCESS (balance unchanged, burned, turn passed)
 *   - Player burned by P1 rejected when P2 picks them
 */

'use strict';

const { createInitialState, evaluateTurn, isPlayerBurned } = require('./lib/gameEngine');

function pass(label) { console.log(`  ✅ PASS — ${label}`); }
function fail(label) { console.log(`  ❌ FAIL — ${label}`); }
function assertEqual(actual, expected, label) {
  if (actual === expected) {
    pass(`${label} (Got ${actual})`);
  } else {
    fail(`${label} (Expected ${expected}, got ${actual})`);
  }
}

function runTests() {
  console.log('\n==================================================');
  console.log('  Game Engine Unit Tests (lib/gameEngine.js)');
  console.log('==================================================\n');

  const initialState = createInitialState({ startingBalance: 700 });

  // ─── Test 1: SUCCESS Case ───────────────────────────────────
  console.log('---- Case 1: SUCCESS (goals = 20, balance = 700 -> 680) ----');
  const res1 = evaluateTurn(initialState, {
    player: { name: 'Mohamed Salah', profileUrl: 'https://fbref.com/en/players/e342ad68/Mohamed-Salah' },
    statStatus: 'SUCCESS',
    statValue: 20
  });

  assertEqual(res1.resultCase, 'SUCCESS', 'Result case is SUCCESS');
  assertEqual(res1.newState.balance, 680, 'Balance updated to 680');
  assertEqual(res1.newState.currentPlayerIndex, 1, 'Turn passed to Player 2 (index 1)');
  assertEqual(res1.newState.player1BurnedList.length, 1, 'Player 1 burned list updated');
  assertEqual(res1.newState.player1BurnedList[0].name, 'Mohamed Salah', 'Salah added to P1 burned list');

  // ─── Test 2: ALREADY_BURNED Case (P1 burned Salah; P2 tries to pick Salah) ─
  console.log('\n---- Case 2: ALREADY_BURNED (Player 2 tries to pick Salah burned by P1) ----');
  const stateWithSalahBurned = res1.newState;
  const res2 = evaluateTurn(stateWithSalahBurned, {
    player: { name: 'Mo Salah', profileUrl: 'https://fbref.com/en/players/e342ad68/Mohamed-Salah' },
    statStatus: 'SUCCESS',
    statValue: 10
  });

  assertEqual(res2.resultCase, 'ALREADY_BURNED', 'Result case is ALREADY_BURNED');
  assertEqual(res2.newState.balance, 680, 'Balance remains unchanged (680)');
  assertEqual(res2.newState.currentPlayerIndex, 1, 'Turn retained by Player 2 (index 1)');

  // Also test loose string matching for ALREADY_BURNED
  const res2b = evaluateTurn(stateWithSalahBurned, {
    player: { name: 'mohamed salah' },
    statStatus: 'SUCCESS',
    statValue: 5
  });
  assertEqual(res2b.resultCase, 'ALREADY_BURNED', 'Name string match returns ALREADY_BURNED');

  // ─── Test 3: TIME_UP Case ───────────────────────────────────
  console.log('\n---- Case 3: TIME_UP (Timer expired) ----');
  const res3 = evaluateTurn(initialState, { timerExpired: true });
  assertEqual(res3.resultCase, 'TIME_UP', 'Result case is TIME_UP');
  assertEqual(res3.newState.balance, 700, 'Balance unchanged (700)');
  assertEqual(res3.newState.currentPlayerIndex, 1, 'Turn lost and passed to Player 2');

  // ─── Test 4: NOT_ASSOCIATED Case ────────────────────────────
  console.log('\n---- Case 4: NOT_ASSOCIATED (No records for club) ----');
  const res4 = evaluateTurn(initialState, {
    player: { name: 'Karim Benzema', profileUrl: 'https://fbref.com/en/players/benzema' },
    statStatus: 'NOT_ASSOCIATED'
  });

  assertEqual(res4.resultCase, 'NOT_ASSOCIATED', 'Result case is NOT_ASSOCIATED');
  assertEqual(res4.newState.balance, 700, 'Balance unchanged (700)');
  assertEqual(res4.newState.currentPlayerIndex, 0, 'Turn retained by current player (index 0)');

  // ─── Test 5: NEEDS_DISAMBIGUATION Case ─────────────────────
  console.log('\n---- Case 5: NEEDS_DISAMBIGUATION (Multiple candidates) ----');
  const res5 = evaluateTurn(initialState, {
    needsDisambiguation: true,
    candidates: [
      { name: 'Mohamed Salah', profileUrl: '/en/players/1' },
      { name: 'Salah Hassan', profileUrl: '/en/players/2' }
    ]
  });

  assertEqual(res5.resultCase, 'NEEDS_DISAMBIGUATION', 'Result case is NEEDS_DISAMBIGUATION');
  assertEqual(res5.candidates.length, 2, 'Returns candidate list of 2 options');
  assertEqual(res5.newState.currentPlayerIndex, 0, 'Turn retained while waiting for choice');

  // ─── Test 6: BUST & WIN Boundary Conditions ────────────────
  console.log('\n---- Case 6: Boundary Conditions (BUST vs WIN vs SUCCESS) ----');

  const lowBalanceState = {
    ...initialState,
    balance: 10,
    currentPlayerIndex: 0
  };

  // 6a. BUST (stat = 11, balance = 10)
  console.log('  Sub-test 6a: BUST (statValue = 11 > balance = 10)');
  const resBust = evaluateTurn(lowBalanceState, {
    player: { name: 'Erling Haaland', profileUrl: '/en/players/haaland' },
    statStatus: 'SUCCESS',
    statValue: 11
  });
  assertEqual(resBust.resultCase, 'BUST', 'Stat 11 > Balance 10 returns BUST');
  assertEqual(resBust.newState.balance, 10, 'Balance unchanged on BUST');
  assertEqual(resBust.newState.currentPlayerIndex, 1, 'Turn lost and passed to Player 2 on BUST');

  // 6b. WIN (stat = 10, balance = 10 -> hits exactly 0)
  console.log('  Sub-test 6b: WIN (statValue = 10 === balance = 10)');
  const resWin = evaluateTurn(lowBalanceState, {
    player: { name: 'Erling Haaland', profileUrl: '/en/players/haaland' },
    statStatus: 'SUCCESS',
    statValue: 10
  });
  assertEqual(resWin.resultCase, 'WIN', 'Stat 10 === Balance 10 returns WIN');
  assertEqual(resWin.newState.balance, 0, 'Balance hits exactly 0');
  assertEqual(resWin.newState.isGameOver, true, 'isGameOver is true');
  assertEqual(resWin.newState.winner, 'Player 1', 'Player 1 declared winner');

  // 6c. SUCCESS (stat = 9, balance = 10 -> balance = 1)
  console.log('  Sub-test 6c: SUCCESS (statValue = 9 < balance = 10)');
  const resSubSuccess = evaluateTurn(lowBalanceState, {
    player: { name: 'Erling Haaland', profileUrl: '/en/players/haaland' },
    statStatus: 'SUCCESS',
    statValue: 9
  });
  assertEqual(resSubSuccess.resultCase, 'SUCCESS', 'Stat 9 < Balance 10 returns SUCCESS');
  assertEqual(resSubSuccess.newState.balance, 1, 'Balance updated to 1');
  assertEqual(resSubSuccess.newState.isGameOver, false, 'Game is not over (isGameOver is false)');

  // 6d. 0-goal SUCCESS
  console.log('  Sub-test 6d: 0-goal SUCCESS (statValue = 0, balance = 700)');
  const resZero = evaluateTurn(initialState, {
    player: { name: 'Defensive Sub', profileUrl: '/en/players/def' },
    statStatus: 'SUCCESS',
    statValue: 0
  });
  assertEqual(resZero.resultCase, 'SUCCESS', '0 goals returns SUCCESS');
  assertEqual(resZero.newState.balance, 700, 'Balance remains 700');
  assertEqual(resZero.newState.player1BurnedList.length, 1, 'Player added to burned list');
  assertEqual(resZero.newState.currentPlayerIndex, 1, 'Turn passed to Player 2');

  console.log('\n==================================================');
  console.log('  Game Engine Test Suite Completed');
  console.log('==================================================\n');
}

runTests();
