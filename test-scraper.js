/**
 * test-scraper.js
 *
 * Unit test script for lib/scraper.js — static data path.
 * Run with: node test-scraper.js
 *
 * All tests operate against in-memory player record objects (matching the
 * static dataset shape) — NO network requests are made at all.
 *
 * Tests:
 *   1. Known competition → SUCCESS with correct goal count
 *   2. Explicit 0-goals competition entry → SUCCESS with value 0 (not NOT_ASSOCIATED)
 *   3. Competition key not in record → NOT_ASSOCIATED
 *   4. Case-insensitive competition name matching ("premier league" == "Premier League")
 *   5. Missing/null playerRecord → ERROR
 *   6. Missing/null leagueName → ERROR
 *   7. Player with no goals_by_competition field → ERROR
 */

'use strict';

const { fetchPlayerStats } = require('./lib/scraper');

function pass(label) { console.log(`  ✅ PASS — ${label}`); }
function fail(label) { console.error(`  ❌ FAIL — ${label}`); }
function info(label) { console.log(`  ℹ  ${label}`); }

// ─── Synthetic player record (mirrors the shape in public/data/players/*.json) ─
const samplePlayer = {
  name: 'Mohamed Salah',
  aliases: ['Mo Salah', 'Salah'],
  goals_by_competition: {
    'Premier League': 186,
    'Champions League': 33,
    'FA Cup': 15,
    'EFL Cup': 0,        // Deliberately 0 — valid SUCCESS, not NOT_ASSOCIATED
  },
  total_goals: 234
};

const playerWithoutGoalsField = {
  name: 'Test Player',
  aliases: [],
  total_goals: 0
  // goals_by_competition is intentionally omitted
};

async function runTests() {
  console.log('\n==================================================');
  console.log('  Scraper Unit Tests — Static Dataset Path');
  console.log('  (node test-scraper.js)');
  console.log('==================================================\n');
  console.log('  Network requests: NONE\n');

  // ── Test 1: Known competition ──────────────────────────────────────────
  console.log('---- Test 1: Known competition ("Premier League") ----');
  try {
    const res = await fetchPlayerStats(samplePlayer, 'Premier League');
    console.log('  Result:', JSON.stringify(res));
    if (res.status === 'SUCCESS' && res.value === 186) {
      pass('Correctly returned SUCCESS with 186 Premier League goals');
    } else {
      fail(`Expected SUCCESS with 186 goals, got: ${JSON.stringify(res)}`);
    }
  } catch (err) {
    fail(`Unexpected exception: ${err.message}`);
  }

  // ── Test 2: Explicit 0-goals entry (must be SUCCESS, not NOT_ASSOCIATED) ─
  console.log('\n---- Test 2: Explicit 0-goals entry ("EFL Cup") ----');
  try {
    const res = await fetchPlayerStats(samplePlayer, 'EFL Cup');
    console.log('  Result:', JSON.stringify(res));
    if (res.status === 'SUCCESS' && res.value === 0) {
      pass('Correctly returned SUCCESS with value 0 for EFL Cup (not NOT_ASSOCIATED)');
    } else {
      fail(`Expected SUCCESS with 0, got: ${JSON.stringify(res)}`);
    }
  } catch (err) {
    fail(`Unexpected exception: ${err.message}`);
  }

  // ── Test 3: Competition not in record ────────────────────────────────────
  console.log('\n---- Test 3: Competition not in record ("Serie A") ----');
  try {
    const res = await fetchPlayerStats(samplePlayer, 'Serie A');
    console.log('  Result:', JSON.stringify(res));
    if (res.status === 'NOT_ASSOCIATED') {
      pass('Correctly returned NOT_ASSOCIATED for competition not in record');
    } else {
      fail(`Expected NOT_ASSOCIATED, got: ${JSON.stringify(res)}`);
    }
  } catch (err) {
    fail(`Unexpected exception: ${err.message}`);
  }

  // ── Test 4: Case-insensitive league name matching ─────────────────────────
  console.log('\n---- Test 4: Case-insensitive matching ("premier league") ----');
  try {
    const res = await fetchPlayerStats(samplePlayer, 'premier league');
    console.log('  Result:', JSON.stringify(res));
    if (res.status === 'SUCCESS' && res.value === 186) {
      pass('Case-insensitive match "premier league" → 186 goals (same as "Premier League")');
    } else {
      fail(`Expected SUCCESS with 186 goals for lowercase input, got: ${JSON.stringify(res)}`);
    }
  } catch (err) {
    fail(`Unexpected exception: ${err.message}`);
  }

  // ── Test 5: Missing playerRecord → ERROR ──────────────────────────────────
  console.log('\n---- Test 5: Missing playerRecord (null) ----');
  try {
    const res = await fetchPlayerStats(null, 'Premier League');
    console.log('  Result:', JSON.stringify(res));
    if (res.status === 'ERROR') {
      pass(`Correctly returned ERROR for null playerRecord: "${res.message}"`);
    } else {
      fail(`Expected ERROR for null playerRecord, got: ${JSON.stringify(res)}`);
    }
  } catch (err) {
    fail(`Unexpected exception: ${err.message}`);
  }

  // ── Test 6: Missing leagueName → ERROR ────────────────────────────────────
  console.log('\n---- Test 6: Missing leagueName (null) ----');
  try {
    const res = await fetchPlayerStats(samplePlayer, null);
    console.log('  Result:', JSON.stringify(res));
    if (res.status === 'ERROR') {
      pass(`Correctly returned ERROR for null leagueName: "${res.message}"`);
    } else {
      fail(`Expected ERROR for null leagueName, got: ${JSON.stringify(res)}`);
    }
  } catch (err) {
    fail(`Unexpected exception: ${err.message}`);
  }

  // ── Test 7: Player without goals_by_competition field → ERROR ─────────────
  console.log('\n---- Test 7: Player without goals_by_competition field ----');
  try {
    const res = await fetchPlayerStats(playerWithoutGoalsField, 'Premier League');
    console.log('  Result:', JSON.stringify(res));
    if (res.status === 'ERROR') {
      pass(`Correctly returned ERROR for missing goals_by_competition field: "${res.message}"`);
    } else {
      fail(`Expected ERROR, got: ${JSON.stringify(res)}`);
    }
  } catch (err) {
    fail(`Unexpected exception: ${err.message}`);
  }

  // ── Test 8: Champions League goals ───────────────────────────────────────
  console.log('\n---- Test 8: Champions League goals ----');
  try {
    const res = await fetchPlayerStats(samplePlayer, 'Champions League');
    console.log('  Result:', JSON.stringify(res));
    if (res.status === 'SUCCESS' && res.value === 33) {
      pass('Correctly returned SUCCESS with 33 Champions League goals');
    } else {
      fail(`Expected SUCCESS with 33 goals, got: ${JSON.stringify(res)}`);
    }
  } catch (err) {
    fail(`Unexpected exception: ${err.message}`);
  }

  console.log('\n==================================================');
  console.log('  Scraper Test Suite Completed');
  console.log('==================================================\n');
}

runTests();
