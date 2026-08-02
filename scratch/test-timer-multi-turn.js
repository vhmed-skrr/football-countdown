const fs = require('fs');
const path = require('path');
const vm = require('vm');

async function testMultiTurnTimer() {
  console.log('=== Starting Multi-Turn TIME_UP Verification Test ===\n');

  const i18nJs = fs.readFileSync(path.join(__dirname, '../public/scripts/i18n.js'), 'utf8') + '; i18n;';
  const appJs = fs.readFileSync(path.join(__dirname, '../public/scripts/app.js'), 'utf8') + '; state;';
  const arJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/locales/ar.json'), 'utf8'));

  const elementsById = new Map();
  const allElements = [];

  class ElementMock {
    constructor(tagName, id = '', className = '') {
      this.tagName = tagName.toUpperCase();
      this.id = id;
      this.className = className;
      this.classList = {
        _classes: new Set(className ? className.split(' ') : []),
        add: (c) => this.classList._classes.add(c),
        remove: (c) => this.classList._classes.delete(c),
        contains: (c) => this.classList._classes.has(c)
      };
      this.attributes = new Map();
      this.eventListeners = {};
      this.textContent = '';
      this.value = '';
      this.style = {};
      if (id) elementsById.set(id, this);
      allElements.push(this);
    }
    setAttribute(k, v) { this.attributes.set(k, String(v)); }
    getAttribute(k) { return this.attributes.get(k) || null; }
    removeAttribute(k) { this.attributes.delete(k); }
    addEventListener(evt, fn) {
      if (!this.eventListeners[evt]) this.eventListeners[evt] = [];
      this.eventListeners[evt].push(fn);
    }
    click() {
      const listeners = this.eventListeners['click'] || [];
      listeners.forEach(fn => fn({ target: this, currentTarget: this }));
    }
    appendChild(child) {
      if (typeof child === 'object') child.parentElement = this;
    }
    set innerHTML(val) {}
  }

  // Create mock DOM elements
  new ElementMock('div', 'screen-menu', 'screen');
  new ElementMock('div', 'screen-setup', 'screen screen--hidden');
  new ElementMock('div', 'screen-pass', 'screen screen--hidden');
  new ElementMock('div', 'screen-arena', 'screen screen--hidden');
  
  new ElementMock('div', 'modal-result-timeup', 'modal-overlay');
  new ElementMock('button', 'btn-timeup-next', 'btn btn-ghost');
  new ElementMock('button', 'btn-pass-ready', 'btn btn-primary');

  new ElementMock('span', 'timer-display', '');
  new ElementMock('div', 'hud-timer', '');
  new ElementMock('span', 'hud-player-name', '');
  new ElementMock('span', 'hud-balance', '');
  new ElementMock('span', 'pass-player-name', '');
  new ElementMock('input', 'arena-search-input', '');
  new ElementMock('button', 'btn-arena-search', '');
  new ElementMock('div', 'burned-list', '');
  new ElementMock('div', 'burned-empty-msg', '');
  new ElementMock('div', 'player-standings', '');

  const mockDocument = {
    body: new ElementMock('body'),
    documentElement: new ElementMock('html'),
    createElement: (tag) => new ElementMock(tag),
    getElementById: (id) => elementsById.get(id) || null,
    querySelectorAll: (selector) => {
      if (selector === '.modal-overlay') return allElements.filter(e => e.classList.contains('modal-overlay'));
      if (selector === '[data-i18n]') return allElements.filter(e => e.attributes.has('data-i18n'));
      return [];
    },
    addEventListener: () => {},
    dispatchEvent: () => {}
  };

  let intervalIdCounter = 1;
  const activeIntervals = new Map();

  const sandbox = {
    document: mockDocument,
    window: { document: mockDocument },
    fetch: async (url, options) => {
      if (url.includes('/locales/ar.json')) return { ok: true, json: async () => arJson };
      if (url === '/api/game/play') {
        const body = JSON.parse(options.body);
        if (body.timerExpired) {
          const ss = JSON.parse(JSON.stringify(body.sessionState));
          const total = (ss.players && ss.players.length) || 2;
          ss.currentPlayerIndex = (ss.currentPlayerIndex + 1) % total;
          return {
            ok: true,
            json: async () => ({
              resultCase: 'TIME_UP',
              sessionState: ss,
              message: "Time's up! Your turn is lost."
            })
          };
        }
      }
      return { ok: false, status: 404 };
    },
    setInterval: (fn, ms) => {
      const id = intervalIdCounter++;
      activeIntervals.set(id, fn);
      console.log(`  [setInterval] Started timer interval #${id}`);
      return id;
    },
    clearInterval: (id) => {
      console.log(`  [clearInterval] Stopped timer interval #${id}`);
      activeIntervals.delete(id);
    },
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
    CustomEvent: class CustomEvent {},
    console: console
  };

  vm.createContext(sandbox);

  sandbox.i18n = vm.runInContext(i18nJs, sandbox);
  await sandbox.i18n.init();
  const appState = vm.runInContext(appJs, sandbox);
  sandbox.setupModalActions();

  // Attach handleReadyClick to btn-pass-ready
  const passReadyBtn = elementsById.get('btn-pass-ready');
  passReadyBtn.addEventListener('click', () => vm.runInContext('handleReadyClick()', sandbox));

  // Turn 1: Player 0 (Alice)
  console.log('1. Initializing 2-player game (Alice vs Bob)...');
  appState.timerEnabled = true;
  appState.timerDuration = 3; // 3 second timer
  appState.sessionState = {
    playerData: {
      0: { balance: 700, burnedList: [] },
      1: { balance: 700, burnedList: [] }
    },
    players: ['Alice', 'Bob'],
    currentPlayerIndex: 0,
    league: 'Premier League',
    club: 'Liverpool',
    category: 'goals'
  };

  console.log('\n2. Starting Turn 1 for Alice (Player 0)...');
  vm.runInContext('handleReadyClick()', sandbox);
  
  if (activeIntervals.size !== 1) {
    throw new Error(`Expected exactly 1 active timer interval, got ${activeIntervals.size}`);
  }
  const initialAliceBal = appState.sessionState.playerData[0].balance;

  // Let 3 seconds pass for Alice
  console.log('  Advancing countdown timer (3 ticks)...');
  for (let t = 1; t <= 3; t++) {
    for (const [id, cb] of Array.from(activeIntervals.entries())) {
      cb();
    }
  }
  await new Promise(r => setTimeout(r, 50));

  const timeupModal = elementsById.get('modal-result-timeup');
  if (!timeupModal.classList.contains('open')) {
    throw new Error('TIME_UP modal did not open when Alice\'s timer expired!');
  }
  if (activeIntervals.size !== 0) {
    throw new Error(`Timer was not stopped after TIME_UP! Active intervals: ${activeIntervals.size}`);
  }
  if (appState.sessionState.playerData[0].balance !== initialAliceBal) {
    throw new Error('Alice\'s balance was modified on TIME_UP (should remain unchanged)');
  }
  if (appState.sessionState.currentPlayerIndex !== 1) {
    throw new Error(`Expected currentPlayerIndex to advance to 1 (Bob), got ${appState.sessionState.currentPlayerIndex}`);
  }
  console.log('  ✓ Turn 1 TIME_UP passed: Modal open, Alice\'s balance unchanged (700), turn advanced to Bob (index 1), interval cleared.');

  // Turn 2: Player 1 (Bob)
  console.log('\n3. Advancing to Turn 2 for Bob (Player 1)...');
  // Click Next Turn on TIME_UP modal
  const btnTimeupNext = elementsById.get('btn-timeup-next');
  btnTimeupNext.click();

  // Click I'm Ready on Pass & Play screen
  passReadyBtn.click();

  if (activeIntervals.size !== 1) {
    throw new Error(`Expected exactly 1 active timer interval for Bob, got ${activeIntervals.size}`);
  }
  const initialBobBal = appState.sessionState.playerData[1].balance;

  // Let 3 seconds pass for Bob
  console.log('  Advancing countdown timer for Bob (3 ticks)...');
  for (let t = 1; t <= 3; t++) {
    for (const [id, cb] of Array.from(activeIntervals.entries())) {
      cb();
    }
  }
  await new Promise(r => setTimeout(r, 50));

  if (!timeupModal.classList.contains('open')) {
    throw new Error('TIME_UP modal did not open when Bob\'s timer expired!');
  }
  if (activeIntervals.size !== 0) {
    throw new Error(`Timer was not stopped after Bob\'s TIME_UP! Active intervals: ${activeIntervals.size}`);
  }
  if (appState.sessionState.playerData[1].balance !== initialBobBal) {
    throw new Error('Bob\'s balance was modified on TIME_UP (should remain unchanged)');
  }
  if (appState.sessionState.currentPlayerIndex !== 0) {
    throw new Error(`Expected currentPlayerIndex to advance back to 0 (Alice), got ${appState.sessionState.currentPlayerIndex}`);
  }
  console.log('  ✓ Turn 2 TIME_UP passed: Modal open, Bob\'s balance unchanged (700), turn advanced back to Alice (index 0), interval cleared.');

  console.log('\n====================================================');
  console.log('🎉 MULTI-TURN TIMER VERIFICATION PASSED 100%!');
  console.log('====================================================');
}

testMultiTurnTimer().catch(err => {
  console.error('\n❌ MULTI-TURN TEST FAILED:', err.message);
  process.exit(1);
});
