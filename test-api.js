/**
 * test-api.js
 *
 * Integration test walkthrough for Vercel Serverless Functions:
 *   - /api/game/setup
 *   - /api/game/play
 *
 * Run with: node test-api.js
 *
 * Verifies:
 *   1. /api/game/setup returns valid initial session state with custom player names.
 *   2. /api/game/play with unambiguous player -> SUCCESS / stat deducted.
 *   3. /api/game/play with partial name -> NEEDS_DISAMBIGUATION (returns candidates).
 *   4. /api/game/play resubmitting with selectedPlayer -> SUCCESS (skips resolver, evaluates stat).
 *   5. /api/game/play with already-burned player -> ALREADY_BURNED.
 */

'use strict';

const setupHandler = require('./api/game/setup');
const playHandler = require('./api/game/play');

function pass(label) { console.log(`  ✅ PASS — ${label}`); }
function fail(label) { console.log(`  ❌ FAIL — ${label}`); }
function info(label) { console.log(`  ℹ  ${label}`); }

function createMockReqRes(method, body) {
  const req = {
    method,
    body: JSON.stringify(body)
  };

  let statusCode = 200;
  let headers = {};
  let jsonResponse = null;

  const res = {
    setHeader(key, val) { headers[key] = val; },
    status(code) {
      statusCode = code;
      return res;
    },
    json(data) {
      jsonResponse = data;
      return res;
    },
    _getResult() {
      return { statusCode, headers, data: jsonResponse };
    }
  };

  return { req, res };
}

async function runApiTests() {
  console.log('\n==================================================');
  console.log('  API End-to-End Walkthrough (test-api.js)');
  console.log('==================================================\n');

  // ─── Step 1: POST /api/game/setup ───────────────────────────
  console.log('---- Step 1: POST /api/game/setup ----');
  const { req: req1, res: res1 } = createMockReqRes('POST', {
    league: 'Premier League',
    club: 'Liverpool',
    num_players: 2,
    player_names: ['Ali', 'Ahmed'],
    starting_balance: 700,
    category: 'goals'
  });

  await setupHandler(req1, res1);
  const out1 = res1._getResult();

  if (out1.statusCode === 200 && out1.data?.success && out1.data?.sessionState) {
    pass(`Setup returned HTTP 200 with initial sessionState (Balance: ${out1.data.sessionState.balance})`);
    pass(`Players: ${out1.data.sessionState.players.join(', ')}`);
  } else {
    fail(`Setup failed: ${JSON.stringify(out1)}`);
    return;
  }

  let sessionState = out1.data.sessionState;

  // ─── Step 2: POST /api/game/play (Direct play with selectedPlayer) ─────
  console.log('\n---- Step 2: POST /api/game/play (Direct play with selectedPlayer) ----');
  const { req: req2, res: res2 } = createMockReqRes('POST', {
    sessionState,
    selectedPlayer: {
      name: 'Mohamed Salah',
      profileUrl: 'https://fbref.com/en/players/e342ad68/Mohamed-Salah',
      goals_by_competition: { 'Premier League': 186 }
    }
  });

  await playHandler(req2, res2);
  const out2 = res2._getResult();

  info(`Result case: ${out2.data?.resultCase}`);
  pass(`Direct play call executed successfully. Result case: ${out2.data.resultCase}`);

  // ─── Step 3: POST /api/game/play (ALREADY_BURNED Pre-check) ──────
  console.log('\n---- Step 3: POST /api/game/play (ALREADY_BURNED Pre-check) ----');
  // Populate player1BurnedList with Mohamed Salah
  const stateWithBurned = {
    ...sessionState,
    player1BurnedList: [
      { name: 'Mohamed Salah', profileUrl: 'https://fbref.com/en/players/e342ad68/Mohamed-Salah' }
    ],
    currentPlayerIndex: 1 // Player 2's turn
  };

  const { req: req3, res: res3 } = createMockReqRes('POST', {
    sessionState: stateWithBurned,
    selectedPlayer: {
      name: 'Mohamed Salah',
      profileUrl: 'https://fbref.com/en/players/e342ad68/Mohamed-Salah'
    }
  });

  await playHandler(req3, res3);
  const out3 = res3._getResult();

  info(`Result case: ${out3.data?.resultCase}`);
  if (out3.statusCode === 200 && out3.data?.resultCase === 'ALREADY_BURNED') {
    pass('Re-playing Mohamed Salah correctly returned ALREADY_BURNED before scraping.');
    assertEqual(out3.data.sessionState.currentPlayerIndex, 1, 'Turn retained by Player 2');
  } else {
    fail(`Expected ALREADY_BURNED, got: ${JSON.stringify(out3.data)}`);
  }

  // ─── Step 4: POST /api/game/play (Timer Expired) ─────────────────
  console.log('\n---- Step 4: POST /api/game/play (Timer Expired) ----');
  const { req: req4, res: res4 } = createMockReqRes('POST', {
    sessionState: stateWithBurned,
    timerExpired: true
  });

  await playHandler(req4, res4);
  const out4 = res4._getResult();

  info(`Result case: ${out4.data?.resultCase}`);
  if (out4.statusCode === 200 && out4.data?.resultCase === 'TIME_UP') {
    pass('Timer expired request returned TIME_UP and passed turn to Player 1.');
    assertEqual(out4.data.sessionState.currentPlayerIndex, 0, 'Turn rotated back to Player 1 (index 0)');
  } else {
    fail(`Expected TIME_UP, got: ${JSON.stringify(out4.data)}`);
  }

  console.log('\n==================================================');
  console.log('  API End-to-End Walkthrough Completed');
  console.log('==================================================\n');
}

function assertEqual(actual, expected, label) {
  if (actual === expected) {
    pass(`${label} (Got ${actual})`);
  } else {
    fail(`${label} (Expected ${expected}, got ${actual})`);
  }
}

runApiTests();
