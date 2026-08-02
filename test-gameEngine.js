/**
 * test-gameEngine.js
 *
 * Unit test suite for lib/gameEngine.js.
 * Run with: node test-gameEngine.js
 *
 * Tests the per-player independent balance model:
 *   - Each player has their own balance in playerData[idx].balance
 *   - A player's turn only affects that player's own balance
 *   - Other players' balances are untouched during someone else's turn
 *   - WIN triggers immediately when the active player's balance hits exactly 0,
 *     correctly identifying WHICH player won — even if others still have balance
 *   - ALREADY_BURNED check remains cross-player (player burned by P1 rejected for P2)
 *   - All other result cases (TIME_UP, NOT_ASSOCIATED, NEEDS_DISAMBIGUATION, BUST) unchanged
 *
 * All 8 result cases covered:
 *   1. SUCCESS: deduction < active player's balance -> that player's balance reduced, burned, turn passed
 *   2. BUST: deduction > active player's balance -> balance unchanged, turn passed
 *   3. ALREADY_BURNED: player in any burned list -> rejected, balance & turn unchanged
 *   4. TIME_UP: timer expired -> turn lost, balance unchanged
 *   5. WIN: active player's balance hits exactly 0 -> game ends, that player wins
 *   6. NOT_ASSOCIATED: 0 club records -> turn retained, balance unchanged
 *   7. NEEDS_DISAMBIGUATION: multiple candidates -> candidates returned for selection
 *   8. Per-player isolation: P1's turns don't affect P2's balance and vice versa
 */

'use strict';

const { createInitialState, evaluateTurn, isPlayerBurned } = require('./lib/gameEngine');

function pass(label) { console.log(`  ✅ PASS — ${label}`); }
function fail(label) { console.log(`  ❌ FAIL — ${label}`); process.exitCode = 1; }
function assertEqual(actual, expected, label) {
  if (actual === expected) {
    pass(`${label} (Got ${actual})`);
  } else {
    fail(`${label} (Expected ${expected}, got ${actual})`);
  }
}

function runTests() {
  console.log('\n==================================================');
  console.log('  Game Engine Unit Tests — Per-Player Balance Model');
  console.log('  (lib/gameEngine.js)');
  console.log('==================================================\n');

  // ─── Initial state sanity ────────────────────────────────────
  console.log('---- Sanity: createInitialState ----');
  const initialState = createInitialState({ startingBalance: 700 });

  assertEqual(typeof initialState.playerData, 'object', 'playerData is an object');
  assertEqual(typeof initialState.playerData[0], 'object', 'playerData[0] exists');
  assertEqual(typeof initialState.playerData[1], 'object', 'playerData[1] exists');
  assertEqual(initialState.playerData[0].balance, 700, 'Player 1 starts at 700');
  assertEqual(initialState.playerData[1].balance, 700, 'Player 2 starts at 700');
  assertEqual(initialState.playerData[0].burnedList.length, 0, 'Player 1 burned list starts empty');
  assertEqual(initialState.playerData[1].burnedList.length, 0, 'Player 2 burned list starts empty');
  // Old shared balance field must NOT exist
  assertEqual('balance' in initialState, false, 'No shared "balance" field on state root (fully removed)');
  assertEqual(initialState.currentPlayerIndex, 0, 'currentPlayerIndex starts at 0');

  // ─── Test 1: SUCCESS — only active player's balance changes ──────────────────
  console.log('\n---- Case 1: SUCCESS (P1 picks, goals=20, P1 balance 700→680; P2 untouched) ----');
  const res1 = evaluateTurn(initialState, {
    player: { name: 'Mohamed Salah', profileUrl: 'https://fbref.com/en/players/e342ad68/Mohamed-Salah' },
    statStatus: 'SUCCESS',
    statValue: 20
  });

  assertEqual(res1.resultCase, 'SUCCESS', 'Result case is SUCCESS');
  assertEqual(res1.newState.playerData[0].balance, 680, 'P1 balance updated to 680');
  assertEqual(res1.newState.playerData[1].balance, 700, 'P2 balance untouched at 700 — independent');
  assertEqual(res1.newState.currentPlayerIndex, 1, 'Turn passed to Player 2 (index 1)');
  assertEqual(res1.newState.playerData[0].burnedList.length, 1, 'Player 1 burned list has 1 entry');
  assertEqual(res1.newState.playerData[0].burnedList[0].name, 'Mohamed Salah', 'Salah in P1 burned list');
  assertEqual(res1.newState.playerData[1].burnedList.length, 0, 'Player 2 burned list still empty');
  assertEqual('balance' in res1.newState, false, 'No shared balance field on newState root');

  // ─── Test 2: SUCCESS — P2's turn only changes P2's balance ──────────────────
  console.log('\n---- Case 2: SUCCESS (P2 picks, goals=50; P1 balance unaffected) ----');
  const stateAfterP1 = res1.newState; // currentPlayerIndex = 1 (P2's turn)
  const res2 = evaluateTurn(stateAfterP1, {
    player: { name: 'Erling Haaland', profileUrl: 'https://fbref.com/en/players/haaland' },
    statStatus: 'SUCCESS',
    statValue: 50
  });

  assertEqual(res2.resultCase, 'SUCCESS', 'Result case is SUCCESS');
  assertEqual(res2.newState.playerData[1].balance, 650, 'P2 balance updated to 650');
  assertEqual(res2.newState.playerData[0].balance, 680, 'P1 balance still 680 — untouched by P2 turn');
  assertEqual(res2.newState.currentPlayerIndex, 0, 'Turn passed back to Player 1 (index 0)');
  assertEqual(res2.newState.playerData[1].burnedList.length, 1, 'P2 burned list has 1 entry (Haaland)');
  assertEqual(res2.newState.playerData[0].burnedList.length, 1, 'P1 burned list unchanged (still just Salah)');

  // ─── Test 3: ALREADY_BURNED — cross-player check ────────────────────────────
  console.log('\n---- Case 3: ALREADY_BURNED (P2 tries to pick Salah who was burned by P1) ----');
  // stateAfterP1 has currentPlayerIndex=1 (P2's turn) and Salah in P1's burned list
  const res3 = evaluateTurn(stateAfterP1, {
    player: { name: 'Mo Salah', profileUrl: 'https://fbref.com/en/players/e342ad68/Mohamed-Salah' },
    statStatus: 'SUCCESS',
    statValue: 10
  });

  assertEqual(res3.resultCase, 'ALREADY_BURNED', 'Cross-player ALREADY_BURNED: P2 rejected for P1-burned player');
  assertEqual(res3.newState.playerData[0].balance, 680, 'P1 balance unchanged');
  assertEqual(res3.newState.playerData[1].balance, 700, 'P2 balance unchanged (turn retained, no deduction)');
  assertEqual(res3.newState.currentPlayerIndex, 1, 'Turn retained by P2 (index 1) on ALREADY_BURNED');

  // Also test normalized name match
  const res3b = evaluateTurn(stateAfterP1, {
    player: { name: 'mohamed salah' },
    statStatus: 'SUCCESS',
    statValue: 5
  });
  assertEqual(res3b.resultCase, 'ALREADY_BURNED', 'Name-normalized ALREADY_BURNED still works');

  // ─── Test 4: TIME_UP ─────────────────────────────────────────
  console.log('\n---- Case 4: TIME_UP (Timer expired) ----');
  const res4 = evaluateTurn(initialState, { timerExpired: true });
  assertEqual(res4.resultCase, 'TIME_UP', 'Result case is TIME_UP');
  assertEqual(res4.newState.playerData[0].balance, 700, 'P1 balance unchanged (700)');
  assertEqual(res4.newState.playerData[1].balance, 700, 'P2 balance unchanged (700)');
  assertEqual(res4.newState.currentPlayerIndex, 1, 'Turn lost and passed to Player 2');

  // ─── Test 5: NOT_ASSOCIATED ───────────────────────────────────
  console.log('\n---- Case 5: NOT_ASSOCIATED (No records for club) ----');
  const res5 = evaluateTurn(initialState, {
    player: { name: 'Karim Benzema', profileUrl: 'https://fbref.com/en/players/benzema' },
    statStatus: 'NOT_ASSOCIATED'
  });

  assertEqual(res5.resultCase, 'NOT_ASSOCIATED', 'Result case is NOT_ASSOCIATED');
  assertEqual(res5.newState.playerData[0].balance, 700, 'P1 balance unchanged (700)');
  assertEqual(res5.newState.playerData[1].balance, 700, 'P2 balance unchanged (700)');
  assertEqual(res5.newState.currentPlayerIndex, 0, 'Turn retained by P1 (index 0)');

  // ─── Test 6: NEEDS_DISAMBIGUATION ──────────────────────────────
  console.log('\n---- Case 6: NEEDS_DISAMBIGUATION (Multiple candidates) ----');
  const res6 = evaluateTurn(initialState, {
    needsDisambiguation: true,
    candidates: [
      { name: 'Mohamed Salah', profileUrl: '/en/players/1' },
      { name: 'Salah Hassan', profileUrl: '/en/players/2' }
    ]
  });

  assertEqual(res6.resultCase, 'NEEDS_DISAMBIGUATION', 'Result case is NEEDS_DISAMBIGUATION');
  assertEqual(res6.candidates.length, 2, 'Returns candidate list of 2 options');
  assertEqual(res6.newState.currentPlayerIndex, 0, 'Turn retained while waiting for choice');

  // ─── Test 7: BUST and WIN boundary — per-player ─────────────────────────────
  console.log('\n---- Case 7: Boundary Conditions (BUST / WIN / SUCCESS) per-player ----');

  // Build a state where P1 has only 10 balance, P2 still has 700
  const lowP1State = createInitialState({ startingBalance: 700 });
  lowP1State.playerData[0].balance = 10; // P1 low
  // currentPlayerIndex is 0 (P1's turn)

  // 7a. BUST (P1, stat=11 > balance=10) — P2 should be completely unaffected
  console.log('  Sub-test 7a: BUST (P1 statValue=11 > P1 balance=10)');
  const resBust = evaluateTurn(lowP1State, {
    player: { name: 'Erling Haaland', profileUrl: '/en/players/haaland' },
    statStatus: 'SUCCESS',
    statValue: 11
  });
  assertEqual(resBust.resultCase, 'BUST', 'BUST when stat > active player balance');
  assertEqual(resBust.newState.playerData[0].balance, 10, 'P1 balance unchanged on BUST (still 10)');
  assertEqual(resBust.newState.playerData[1].balance, 700, 'P2 balance untouched on P1 BUST (still 700)');
  assertEqual(resBust.newState.currentPlayerIndex, 1, 'Turn passed to P2 on BUST');

  // 7b. WIN (P1, stat=10 === balance=10) — game ends, P2 still has 700 but game is OVER
  console.log('  Sub-test 7b: WIN (P1 statValue=10 === P1 balance=10; game ends immediately)');
  const resWin = evaluateTurn(lowP1State, {
    player: { name: 'Erling Haaland', profileUrl: '/en/players/haaland' },
    statStatus: 'SUCCESS',
    statValue: 10
  });
  assertEqual(resWin.resultCase, 'WIN', 'WIN when active player balance hits exactly 0');
  assertEqual(resWin.newState.playerData[0].balance, 0, 'P1 balance is exactly 0');
  assertEqual(resWin.newState.playerData[1].balance, 700, 'P2 balance still 700 — game ended before P2 touched 0');
  assertEqual(resWin.newState.isGameOver, true, 'isGameOver is true');
  assertEqual(resWin.newState.winner, 'Player 1', 'Player 1 declared winner');

  // 7c. SUCCESS (P1, stat=9 < balance=10) — P2 untouched
  console.log('  Sub-test 7c: SUCCESS (P1 statValue=9 < P1 balance=10)');
  const resSuccess = evaluateTurn(lowP1State, {
    player: { name: 'Erling Haaland', profileUrl: '/en/players/haaland' },
    statStatus: 'SUCCESS',
    statValue: 9
  });
  assertEqual(resSuccess.resultCase, 'SUCCESS', 'SUCCESS when stat < active player balance');
  assertEqual(resSuccess.newState.playerData[0].balance, 1, 'P1 balance updated to 1');
  assertEqual(resSuccess.newState.playerData[1].balance, 700, 'P2 balance still 700 — not touched');
  assertEqual(resSuccess.newState.isGameOver, false, 'Game not over (isGameOver false)');

  // 7d. 0-goal SUCCESS — player with 0 goals is still burned, balance unchanged
  console.log('  Sub-test 7d: 0-goal SUCCESS (statValue=0, P1 balance stays 700, burned)');
  const resZero = evaluateTurn(initialState, {
    player: { name: 'Defensive Sub', profileUrl: '/en/players/def' },
    statStatus: 'SUCCESS',
    statValue: 0
  });
  assertEqual(resZero.resultCase, 'SUCCESS', '0 goals returns SUCCESS');
  assertEqual(resZero.newState.playerData[0].balance, 700, 'P1 balance stays 700 (0 deducted)');
  assertEqual(resZero.newState.playerData[1].balance, 700, 'P2 balance stays 700');
  assertEqual(resZero.newState.playerData[0].burnedList.length, 1, 'Player added to P1 burned list');
  assertEqual(resZero.newState.currentPlayerIndex, 1, 'Turn passed to Player 2');

  // ─── Test 8: 3-player game — WIN identifies correct player ──────────────────
  console.log('\n---- Case 8: 3-player game — P2 wins, P1 and P3 still have balance ----');
  const threePlayerState = createInitialState({
    startingBalance: 100,
    players: ['Alice', 'Bob', 'Carol']
  });

  assertEqual(typeof threePlayerState.playerData[2], 'object', '3-player state has playerData[2]');
  assertEqual(threePlayerState.playerData[2].balance, 100, 'Player 3 (Carol) starts at 100');

  // Advance to P2's turn (index 1 = Bob)
  threePlayerState.currentPlayerIndex = 1;
  threePlayerState.playerData[1].balance = 50; // Bob only needs 50 to win

  const resP2Win = evaluateTurn(threePlayerState, {
    player: { name: 'Thierry Henry', profileUrl: '/en/players/henry' },
    statStatus: 'SUCCESS',
    statValue: 50
  });

  assertEqual(resP2Win.resultCase, 'WIN', '3-player game: WIN when P2 hits 0');
  assertEqual(resP2Win.newState.winner, 'Bob', 'Winner is specifically "Bob", not a generic string');
  assertEqual(resP2Win.newState.playerData[0].balance, 100, 'Alice (P1) balance untouched at 100');
  assertEqual(resP2Win.newState.playerData[1].balance, 0, 'Bob (P2) balance is 0');
  assertEqual(resP2Win.newState.playerData[2].balance, 100, 'Carol (P3) balance untouched at 100');
  assertEqual(resP2Win.newState.isGameOver, true, 'isGameOver true immediately on Bob winning');

  // ─── Test 9: isPlayerBurned reads from new playerData structure ─────────────
  console.log('\n---- Case 9: isPlayerBurned reads from playerData (not old p1/p2 lists) ----');
  const stateWithBurned = createInitialState({ startingBalance: 700 });
  stateWithBurned.playerData[0].burnedList.push({
    name: 'Test Player',
    profileUrl: 'https://example.com/test-player'
  });

  assertEqual(
    isPlayerBurned(stateWithBurned, { name: 'Test Player', profileUrl: 'https://example.com/test-player' }),
    true,
    'isPlayerBurned returns true for player in playerData[0].burnedList'
  );
  assertEqual(
    isPlayerBurned(stateWithBurned, { name: 'Unknown Player', profileUrl: 'https://example.com/other' }),
    false,
    'isPlayerBurned returns false for player not in any burned list'
  );

  console.log('\n==================================================');
  console.log('  Game Engine Test Suite Completed');
  console.log('==================================================\n');
}

runTests();
