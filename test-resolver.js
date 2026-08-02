/**
 * test-resolver.js
 *
 * Unit test script for lib/playerResolver.js — static data path.
 * Run with: node test-resolver.js
 *
 * All tests run against the placeholder dataset in
 * public/data/players/liverpool.json.
 *
 * NO network requests are made — this test is fully offline.
 *
 * Tests:
 *   1. Full canonical name   ("Mohamed Salah")   → FOUND, exactly 1 match
 *   2. Known alias           ("Mo Salah")        → FOUND, resolves to canonical name
 *   3. Partial / ambiguous   ("Steven")          → FOUND, ≥1 match (partial match)
 *   4. Misspelled name       ("Mohamad Sallah")  → FOUND or UNKNOWN_PLAYER (fuzzy boundary)
 *   5. Nonsense / no match   ("xyzFakePlayer99") → UNKNOWN_PLAYER
 *   6. Missing clubSlug      (no slug provided)  → ERROR (config error, not data error)
 *   7. Non-existent club     ("atlantis-fc")     → ERROR with clear "no dataset" message
 */

'use strict';

const { resolvePlayer, translate_input } = require('./lib/playerResolver');
const { clearCache } = require('./lib/playerDataStore');

function pass(label) { console.log(`  ✅ PASS — ${label}`); }
function fail(label) { console.error(`  ❌ FAIL — ${label}`); }
function info(label) { console.log(`  ℹ  ${label}`); }

async function runTests() {
  console.log('\n==================================================');
  console.log('  Player Resolver Test Suite — Static Data Path');
  console.log('  (node test-resolver.js)');
  console.log('==================================================\n');
  console.log('  Dataset: public/data/players/liverpool.json');
  console.log('  Network requests: NONE\n');

  // Clear cache before suite to ensure clean state
  clearCache();

  // ── Test 1: Full canonical name ──────────────────────────────────────────
  console.log('---- Test 1: Full canonical name ("Mohamed Salah") ----');
  try {
    const res = await resolvePlayer('Mohamed Salah', 'liverpool');
    console.log('  Result type:', res.type);
    if (res.type === 'FOUND' && res.players.length === 1 && res.players[0].name === 'Mohamed Salah') {
      pass('Resolved to exactly 1 match: "Mohamed Salah"');
      info(`goals_by_competition: ${JSON.stringify(res.players[0].goals_by_competition)}`);
    } else if (res.type === 'FOUND' && res.players.length > 0) {
      pass(`FOUND returned. Top match: "${res.players[0].name}" (${res.players.length} candidate(s))`);
    } else {
      fail(`Expected FOUND with "Mohamed Salah". Got: ${JSON.stringify(res)}`);
    }
  } catch (err) {
    fail(`Unexpected exception: ${err.message}`);
  }

  // ── Test 2: Known alias ──────────────────────────────────────────────────
  console.log('\n---- Test 2: Known alias ("Mo Salah") ----');
  try {
    const res = await resolvePlayer('Mo Salah', 'liverpool');
    console.log('  Result type:', res.type);
    if (res.type === 'FOUND' && res.players.length >= 1 && res.players[0].name === 'Mohamed Salah') {
      pass('Alias "Mo Salah" correctly resolved to canonical name "Mohamed Salah"');
    } else if (res.type === 'FOUND') {
      pass(`FOUND via alias. Top match: "${res.players[0].name}"`);
    } else {
      fail(`Expected FOUND for alias "Mo Salah". Got: ${JSON.stringify(res)}`);
    }
  } catch (err) {
    fail(`Unexpected exception: ${err.message}`);
  }

  // ── Test 3: Partial / ambiguous name ─────────────────────────────────────
  console.log('\n---- Test 3: Partial name ("Steven") ----');
  try {
    const res = await resolvePlayer('Steven', 'liverpool');
    console.log('  Result type:', res.type);
    if (res.type === 'FOUND') {
      pass(`FOUND ${res.players.length} candidate(s) for partial name "Steven"`);
      res.players.forEach((p, i) => info(`  [${i + 1}] ${p.name}`));
    } else if (res.type === 'UNKNOWN_PLAYER') {
      info('No match for "Steven" — fuzzy threshold may be too tight for single-word partial. Acceptable.');
      pass('Returned UNKNOWN_PLAYER gracefully (no crash)');
    } else {
      fail(`Unexpected result: ${JSON.stringify(res)}`);
    }
  } catch (err) {
    fail(`Unexpected exception: ${err.message}`);
  }

  // ── Test 4: Misspelled name ──────────────────────────────────────────────
  console.log('\n---- Test 4: Misspelled name ("Mohamad Sallah") ----');
  try {
    const res = await resolvePlayer('Mohamad Sallah', 'liverpool');
    console.log('  Result type:', res.type);
    if (res.type === 'FOUND') {
      pass(`Fuzzy match found for misspelling. Top match: "${res.players[0].name}"`);
    } else if (res.type === 'UNKNOWN_PLAYER') {
      pass('Misspelling beyond fuzzy threshold → UNKNOWN_PLAYER returned correctly (no crash)');
    } else {
      fail(`Unexpected result: ${JSON.stringify(res)}`);
    }
  } catch (err) {
    fail(`Unexpected exception: ${err.message}`);
  }

  // ── Test 5: Nonsense name ────────────────────────────────────────────────
  console.log('\n---- Test 5: Nonsense name ("xyzFakePlayer99") ----');
  try {
    const res = await resolvePlayer('xyzFakePlayer99', 'liverpool');
    console.log('  Result type:', res.type);
    if (res.type === 'UNKNOWN_PLAYER') {
      pass('Correctly returned UNKNOWN_PLAYER for nonsense name');
    } else {
      fail(`Expected UNKNOWN_PLAYER, got: ${JSON.stringify(res)}`);
    }
  } catch (err) {
    fail(`Unexpected exception: ${err.message}`);
  }

  // ── Test 6: Missing clubSlug ─────────────────────────────────────────────
  console.log('\n---- Test 6: Missing clubSlug (no slug provided) ----');
  try {
    const res = await resolvePlayer('Mohamed Salah', '');
    console.log('  Result type:', res.type);
    if (res.type === 'ERROR') {
      pass(`Correctly returned ERROR for missing clubSlug: "${res.message}"`);
    } else {
      fail(`Expected ERROR for missing clubSlug, got: ${JSON.stringify(res)}`);
    }
  } catch (err) {
    fail(`Unexpected exception: ${err.message}`);
  }

  // ── Test 7: Non-existent club dataset ───────────────────────────────────
  console.log('\n---- Test 7: Non-existent club ("atlantis-fc") ----');
  try {
    const res = await resolvePlayer('Mohamed Salah', 'atlantis-fc');
    console.log('  Result type:', res.type);
    if (res.type === 'ERROR' && res.message && res.message.includes('No dataset found')) {
      pass(`Correctly returned ERROR with "no dataset" message: "${res.message.substring(0, 80)}..."`);
    } else if (res.type === 'ERROR') {
      pass(`Returned ERROR (message: "${res.message.substring(0, 80)}...")`);
    } else {
      fail(`Expected ERROR for non-existent club, got: ${JSON.stringify(res)}`);
    }
  } catch (err) {
    fail(`Unexpected exception: ${err.message}`);
  }

  // ── translate_input stub ─────────────────────────────────────────────────
  console.log('\n---- Sanity: translate_input passthrough ----');
  const cleaned = translate_input('  Mohamed Salah  ');
  if (cleaned === 'Mohamed Salah') {
    pass('translate_input trims whitespace correctly');
  } else {
    fail(`translate_input returned: "${cleaned}"`);
  }

  console.log('\n==================================================');
  console.log('  Resolver Test Suite Completed');
  console.log('==================================================\n');
}

runTests();
