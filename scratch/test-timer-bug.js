const setupHandler = require('../api/game/setup');
const playHandler = require('../api/game/play');

async function testTimerFlow() {
  console.log('--- Testing Game Setup ---');
  let setupState = null;
  const mockReqSetup = {
    method: 'POST',
    body: {
      players: ['Player 1', 'Player 2'],
      league: 'Premier League',
      club: 'Liverpool',
      category: 'goals',
      startingBalance: 700
    }
  };
  const mockResSetup = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(data) { setupState = data.sessionState; }
  };

  await setupHandler(mockReqSetup, mockResSetup);
  console.log('Setup Initial State:', setupState);

  console.log('\n--- Testing Timer Expired Play Submission ---');
  let playResponse = null;
  const mockReqPlay = {
    method: 'POST',
    body: {
      sessionState: setupState,
      playerQuery: null,
      timerExpired: true
    }
  };
  const mockResPlay = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(data) { playResponse = data; }
  };

  await playHandler(mockReqPlay, mockResPlay);
  console.log('Play Response on Timer Expired:', playResponse);
}

testTimerFlow().catch(console.error);
