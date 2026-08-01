const setupHandler = require('../api/game/setup');
const playHandler = require('../api/game/play');

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

async function testPlayFlow(club, clubSlug, playerName, expectedGoals) {
  // 1. Setup session
  const { req: sReq, res: sRes } = createMockReqRes('POST', {
    league: 'Premier League',
    club: club,
    clubSlug: clubSlug,
    num_players: 2,
    player_names: ['P1', 'P2'],
    starting_balance: 700,
    category: 'goals'
  });
  await setupHandler(sReq, sRes);
  const sessionState = sRes._getResult().data.sessionState;

  // 2. Play turn with query
  const { req: pReq, res: pRes } = createMockReqRes('POST', {
    sessionState,
    playerQuery: playerName
  });
  await playHandler(pReq, pRes);
  let playResult = pRes._getResult().data;

  // 3. Handle disambiguation if needed
  if (playResult.resultCase === 'NEEDS_DISAMBIGUATION') {
    console.log(`  ℹ "${playerName}" returned NEEDS_DISAMBIGUATION (${playResult.candidates.length} candidates found), selecting top candidate...`);
    const selectedPlayer = playResult.candidates.find(c => c.name === playerName) || playResult.candidates[0];

    const { req: selReq, res: selRes } = createMockReqRes('POST', {
      sessionState: playResult.sessionState,
      selectedPlayer
    });
    await playHandler(selReq, selRes);
    playResult = selRes._getResult().data;
  }

  console.log(`\nTesting [${club}] "${playerName}":`);
  console.log(`  resultCase: ${playResult.resultCase}`);
  console.log(`  statDeducted: ${playResult.statDeducted}`);
  console.log(`  newBalance: ${playResult.sessionState?.balance}`);

  if (playResult.resultCase === 'SUCCESS' && playResult.statDeducted === expectedGoals) {
    console.log(`  ✅ PASS: "${playerName}" in ${club} returned SUCCESS with ${playResult.statDeducted} goals.`);
    return true;
  } else {
    console.log(`  ❌ FAIL: Expected SUCCESS with ${expectedGoals} goals, got resultCase="${playResult.resultCase}", statDeducted=${playResult.statDeducted}`);
    return false;
  }
}

async function main() {
  console.log('====================================================');
  console.log('  Testing /api/game/play end-to-end for 5 players');
  console.log('====================================================');

  let allPassed = true;
  allPassed = (await testPlayFlow('Manchester City', 'manchester-city', 'Andreas Isaksson', 0)) && allPassed;
  allPassed = (await testPlayFlow('Manchester City', 'manchester-city', 'Erling Haaland', 91)) && allPassed;
  allPassed = (await testPlayFlow('Liverpool', 'liverpool', 'Mohamed Salah', 193)) && allPassed;
  allPassed = (await testPlayFlow('Chelsea', 'chelsea', 'Cole Palmer', 40)) && allPassed;
  allPassed = (await testPlayFlow('Arsenal', 'arsenal', 'Bukayo Saka', 73)) && allPassed;

  if (allPassed) {
    console.log('\n✅ ALL E2E PLAY TESTS PASSED SUCCESSFULLY!');
  } else {
    console.log('\n❌ SOME TESTS FAILED.');
    process.exit(1);
  }
}

main();
