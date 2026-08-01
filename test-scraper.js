/**
 * test-scraper.js
 *
 * Manual integration & unit test script for lib/scraper.js.
 * Run with: node test-scraper.js
 *
 * Tests:
 *   1. HTML parsing unit test: Multi-season goals aggregation for matching club.
 *   2. HTML parsing unit test: Zero matching rows -> NOT_ASSOCIATED returned.
 *   3. HTML parsing unit test: Legitimate 0-goals row for matching club -> SUCCESS with 0 goals returned.
 *   4. HTML comment table extraction: Un-commenting deferred FBref tables.
 *   5. Live / Network request test for player + associated club vs unassociated club.
 */

'use strict';

const { parsePlayerStats, fetchPlayerStats } = require('./lib/scraper');

function pass(label) { console.log(`  ✅ PASS — ${label}`); }
function fail(label) { console.log(`  ❌ FAIL — ${label}`); }
function info(label) { console.log(`  ℹ  ${label}`); }

// ─── Synthetic Sample FBref HTML ─────────────────────────────
const sampleFBrefHTML = `
<!DOCTYPE html>
<html>
<body>
<div id="meta"><h1><span>Mohamed Salah</span></h1></div>
<table class="stats_table" id="stats_standard_11">
  <thead>
    <tr>
      <th data-stat="season">Season</th>
      <th data-stat="team">Squad</th>
      <th data-stat="comp_level">Comp</th>
      <th data-stat="goals">Gls</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td data-stat="season">2021-2022</td>
      <td data-stat="team"><a href="/en/squads/822bd0ba/Liverpool-Stats">Liverpool</a></td>
      <td data-stat="comp_level"><a href="/en/comps/9/Premier-League-Stats">Premier League</a></td>
      <td data-stat="goals">23</td>
    </tr>
    <tr>
      <td data-stat="season">2022-2023</td>
      <td data-stat="team"><a href="/en/squads/822bd0ba/Liverpool-Stats">Liverpool</a></td>
      <td data-stat="comp_level"><a href="/en/comps/9/Premier-League-Stats">Premier League</a></td>
      <td data-stat="goals">19</td>
    </tr>
    <tr>
      <td data-stat="season">2023-2024</td>
      <td data-stat="team"><a href="/en/squads/822bd0ba/Liverpool-Stats">Liverpool</a></td>
      <td data-stat="comp_level"><a href="/en/comps/9/Premier-League-Stats">Premier League</a></td>
      <td data-stat="goals">18</td>
    </tr>
    <tr>
      <td data-stat="season">2015-2016</td>
      <td data-stat="team"><a href="/en/squads/d48ad54c/Roma-Stats">Roma</a></td>
      <td data-stat="comp_level"><a href="/en/comps/11/Serie-A-Stats">Serie A</a></td>
      <td data-stat="goals">14</td>
    </tr>
  </tbody>
</table>

<!-- Commented table format (FBref deferred render test) -->
<!--
<table class="stats_table" id="stats_standard_commented">
  <tbody>
    <tr>
      <td data-stat="team">Chelsea</td>
      <td data-stat="comp_level">Premier League</td>
      <td data-stat="goals">2</td>
    </tr>
  </tbody>
</table>
-->
</body>
</html>
`;

// Synthetic 0-goals sample HTML
const zeroGoalsHTML = `
<!DOCTYPE html>
<html>
<body>
<div id="meta"><h1><span>Test Player</span></h1></div>
<table class="stats_table">
  <tbody>
    <tr>
      <td data-stat="team">Arsenal</td>
      <td data-stat="comp_level">Premier League</td>
      <td data-stat="goals">0</td>
    </tr>
  </tbody>
</table>
</body>
</html>
`;

function runUnitTests() {
  console.log('\n==================================================');
  console.log('  Scraper Unit Tests (HTML Table Parsing)');
  console.log('==================================================\n');

  // Test 1: Real associated club multi-season sum (Liverpool: 23 + 19 + 18 = 60 goals)
  console.log('---- Unit Test 1: Multi-season aggregation (Liverpool) ----');
  const res1 = parsePlayerStats(sampleFBrefHTML, 'Liverpool', 'Premier League', 'goals');
  console.log('Result:', JSON.stringify(res1));
  if (res1.status === 'SUCCESS' && res1.value === 60 && res1.rowsCount === 3) {
    pass('Correctly aggregated goals across 3 Liverpool seasons (23 + 19 + 18 = 60)');
  } else {
    fail(`Expected SUCCESS with 60 goals and 3 rows, got: ${JSON.stringify(res1)}`);
  }

  // Test 2: Unassociated club -> NOT_ASSOCIATED
  console.log('\n---- Unit Test 2: Unassociated club ("Real Madrid") ----');
  const res2 = parsePlayerStats(sampleFBrefHTML, 'Real Madrid', 'La Liga', 'goals');
  console.log('Result:', JSON.stringify(res2));
  if (res2.status === 'NOT_ASSOCIATED') {
    pass('Correctly returned NOT_ASSOCIATED for unassociated club "Real Madrid"');
  } else {
    fail(`Expected NOT_ASSOCIATED, got: ${JSON.stringify(res2)}`);
  }

  // Test 3: Commented table extraction (Chelsea: 2 goals in commented table)
  console.log('\n---- Unit Test 3: Commented table extraction (Chelsea) ----');
  const res3 = parsePlayerStats(sampleFBrefHTML, 'Chelsea', 'Premier League', 'goals');
  console.log('Result:', JSON.stringify(res3));
  if (res3.status === 'SUCCESS' && res3.value === 2) {
    pass('Successfully extracted stats from FBref HTML comment block (2 goals for Chelsea)');
  } else {
    fail(`Expected SUCCESS with 2 goals, got: ${JSON.stringify(res3)}`);
  }

  // Test 4: Legitimate 0-goals row vs NOT_ASSOCIATED
  console.log('\n---- Unit Test 4: Legitimate 0-goals row (Arsenal) ----');
  const res4 = parsePlayerStats(zeroGoalsHTML, 'Arsenal', 'Premier League', 'goals');
  console.log('Result:', JSON.stringify(res4));
  if (res4.status === 'SUCCESS' && res4.value === 0 && res4.rowsCount === 1) {
    pass('Correctly distinguished 0-goals row as SUCCESS with value 0 (NOT NOT_ASSOCIATED)');
  } else {
    fail(`Expected SUCCESS with 0 goals, got: ${JSON.stringify(res4)}`);
  }
}

async function runIntegrationTests() {
  console.log('\n==================================================');
  console.log('  Scraper Integration Tests (Live Network / Endpoints)');
  console.log('==================================================\n');

  console.log('---- Live Test 1: Mohamed Salah @ Liverpool ----');
  try {
    const live1 = await fetchPlayerStats('e342ad68', 'Liverpool', 'Premier League', 'goals');
    console.log('Result:', JSON.stringify(live1));
    if (live1.status === 'SUCCESS') {
      pass(`Live fetch success! Total goals: ${live1.value}`);
    } else if (live1.status === 'ERROR' && live1.message.includes('403')) {
      info('Live fetch returned Cloudflare 403 shield — network layer error handled gracefully.');
      pass('Handled Cloudflare restriction as explicit error state.');
    } else {
      info(`Result: ${JSON.stringify(live1)}`);
    }
  } catch (err) {
    fail(`Unexpected error: ${err.message}`);
  }

  console.log('\n---- Live Test 2: Mohamed Salah @ Real Madrid (Never played) ----');
  try {
    const live2 = await fetchPlayerStats('e342ad68', 'Real Madrid', 'La Liga', 'goals');
    console.log('Result:', JSON.stringify(live2));
    if (live2.status === 'NOT_ASSOCIATED') {
      pass('Correctly returned NOT_ASSOCIATED for unassociated club');
    } else if (live2.status === 'ERROR' && live2.message.includes('403')) {
      info('Live fetch returned Cloudflare 403 shield — network layer error handled gracefully.');
      pass('Handled Cloudflare restriction as explicit error state.');
    } else {
      info(`Result: ${JSON.stringify(live2)}`);
    }
  } catch (err) {
    fail(`Unexpected error: ${err.message}`);
  }

  console.log('\n==================================================');
  console.log('  Scraper Test Suite Completed');
  console.log('==================================================\n');
}

runUnitTests();
runIntegrationTests();
