const fs = require('fs');
const path = require('path');
const setupHandler = require('../api/game/setup');
const playHandler = require('../api/game/play');

async function runCleanupAuditTests() {
  console.log('=== Running Cleanup & Project Hygiene Audit Verification ===\n');

  // 1. Raw Data Files Move
  console.log('1. Verifying Raw Data Files relocation & .gitignore...');
  const rootRawFiles = ['Bundesliga.md', 'Laliga.md', 'premier_league_clubs_players.md'];
  rootRawFiles.forEach(file => {
    if (fs.existsSync(path.join(__dirname, '..', file))) {
      throw new Error(`Raw file ${file} still exists in project root!`);
    }
  });

  const rawDir = path.join(__dirname, '../data-raw');
  if (!fs.existsSync(rawDir)) throw new Error('data-raw/ directory missing');
  rootRawFiles.forEach(file => {
    if (!fs.existsSync(path.join(rawDir, file))) {
      throw new Error(`Raw file ${file} missing from data-raw/`);
    }
  });

  const gitignore = fs.readFileSync(path.join(__dirname, '../.gitignore'), 'utf8');
  if (!gitignore.includes('data-raw/')) {
    throw new Error('.gitignore does not contain data-raw/');
  }
  console.log('   ✓ Raw data files moved to data-raw/ and added to .gitignore.\n');

  // 2. Package.json Dependencies
  console.log('2. Verifying package.json dependencies...');
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
  if (pkg.dependencies && pkg.dependencies.axios) {
    throw new Error('axios should not be in dependencies!');
  }
  if (!pkg.devDependencies || !pkg.devDependencies.axios) {
    throw new Error('axios should be in devDependencies!');
  }
  if (!pkg.dependencies || !pkg.dependencies['fuse.js']) {
    throw new Error('fuse.js must remain in dependencies!');
  }
  console.log('   ✓ axios moved to devDependencies; fuse.js correctly retained in dependencies.\n');

  // 3. Players README documentation
  console.log('3. Verifying public/data/players/README.md documentation...');
  const readme = fs.readFileSync(path.join(__dirname, '../public/data/players/README.md'), 'utf8');
  if (readme.includes('PLACEHOLDER DATA') || readme.includes('approximate/representative only')) {
    throw new Error('README.md still contains stale placeholder notice!');
  }
  if (!readme.includes('13 clubs') || !readme.includes('league goal totals')) {
    throw new Error('README.md does not accurately document the 13 real club datasets and scope limitations!');
  }
  console.log('   ✓ README.md updated to document the 13 real club datasets and league scope.\n');

  // 4. API Input Validation in setup.js
  console.log('4. Testing api/game/setup.js input validation...');
  const mockRes = () => {
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      status(code) { this.statusCode = code; return this; },
      json(data) { this.data = data; return this; },
      end() { return this; }
    };
    return res;
  };

  // 4a. Invalid num_players < 2
  let res = mockRes();
  await setupHandler({ method: 'POST', body: { num_players: 1, starting_balance: 700 } }, res);
  if (res.statusCode !== 400 || !res.data.error.includes('num_players')) {
    throw new Error(`Expected 400 for num_players: 1, got ${res.statusCode} ${JSON.stringify(res.data)}`);
  }

  // 4b. Invalid num_players > 8
  res = mockRes();
  await setupHandler({ method: 'POST', body: { num_players: 9, starting_balance: 700 } }, res);
  if (res.statusCode !== 400 || !res.data.error.includes('num_players')) {
    throw new Error(`Expected 400 for num_players: 9, got ${res.statusCode} ${JSON.stringify(res.data)}`);
  }

  // 4c. Invalid starting_balance <= 0
  res = mockRes();
  await setupHandler({ method: 'POST', body: { num_players: 2, starting_balance: 0 } }, res);
  if (res.statusCode !== 400 || !res.data.error.includes('starting_balance')) {
    throw new Error(`Expected 400 for starting_balance: 0, got ${res.statusCode} ${JSON.stringify(res.data)}`);
  }

  // 4d. Valid setup request
  res = mockRes();
  await setupHandler({ method: 'POST', body: { num_players: 4, starting_balance: 500, league: 'Premier League', club: 'Liverpool' } }, res);
  if (res.statusCode !== 200 || !res.data.success || !res.data.sessionState) {
    throw new Error(`Expected 200 for valid setup request, got ${res.statusCode} ${JSON.stringify(res.data)}`);
  }
  if (res.data.sessionState.players.length !== 4) {
    throw new Error(`Expected 4 players in sessionState, got ${res.data.sessionState.players.length}`);
  }
  const validState = res.data.sessionState;
  console.log('   ✓ Input validation correctly rejects num_players outside [2-8] and non-positive starting_balance.\n');

  // 5. CORS Headers & OPTIONS preflight
  console.log('5. Testing CORS headers & OPTIONS preflight in setup.js & play.js...');
  
  // Setup OPTIONS
  res = mockRes();
  await setupHandler({ method: 'OPTIONS' }, res);
  if (res.statusCode !== 204 || res.headers['Access-Control-Allow-Origin'] !== '*') {
    throw new Error(`Setup OPTIONS request failed. Code: ${res.statusCode}, Headers: ${JSON.stringify(res.headers)}`);
  }

  // Play OPTIONS
  res = mockRes();
  await playHandler({ method: 'OPTIONS' }, res);
  if (res.statusCode !== 204 || res.headers['Access-Control-Allow-Origin'] !== '*') {
    throw new Error(`Play OPTIONS request failed. Code: ${res.statusCode}, Headers: ${JSON.stringify(res.headers)}`);
  }
  console.log('   ✓ CORS headers and OPTIONS preflight (204) handled correctly for both setup and play API endpoints.\n');

  // 6. Gameplay Sanity Test
  console.log('6. End-to-end gameplay sanity check (SUCCESS and BUST resolution)...');
  
  // Play turn: Mohamed Salah selected candidate (goals deducted, SUCCESS)
  const targetPlayer = { name: 'Mohamed Salah', goals_by_competition: { 'Premier League': 193 }, total_goals: 193 };
  res = mockRes();
  await playHandler({
    method: 'POST',
    body: {
      sessionState: validState,
      selectedPlayer: targetPlayer
    }
  }, res);

  if (res.statusCode !== 200 || res.data.resultCase !== 'SUCCESS') {
    throw new Error(`Expected SUCCESS turn result for Mohamed Salah, got ${res.statusCode} ${JSON.stringify(res.data)}`);
  }

  const stateAfterSuccess = res.data.sessionState;
  
  // Play turn: ALREADY_BURNED (Player tries to guess Mohamed Salah again)
  res = mockRes();
  await playHandler({
    method: 'POST',
    body: {
      sessionState: stateAfterSuccess,
      selectedPlayer: targetPlayer
    }
  }, res);

  if (res.statusCode !== 200 || res.data.resultCase !== 'ALREADY_BURNED') {
    throw new Error(`Expected ALREADY_BURNED turn result, got ${res.statusCode} ${JSON.stringify(res.data)}`);
  }
  console.log('   ✓ Gameplay sanity check passed: setup, play turn, SUCCESS and ALREADY_BURNED resolve cleanly.\n');

  console.log('====================================================');
  console.log('🎉 ALL PROJECT HYGIENE AUDIT TESTS PASSED 100%!');
  console.log('====================================================');
}

runCleanupAuditTests().catch(err => {
  console.error('\n❌ AUDIT TEST FAILED:', err.message);
  process.exit(1);
});
