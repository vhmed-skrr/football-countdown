const fs = require('fs');
const path = require('path');
const vm = require('vm');

async function testBrowserTimerBehavior() {
  console.log('=== Simulating Countdown Timer in DOM ===\n');

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
  }

  // Create mock DOM structure
  new ElementMock('div', 'screen-menu', 'screen');
  new ElementMock('div', 'screen-setup', 'screen screen--hidden');
  new ElementMock('div', 'screen-pass', 'screen screen--hidden');
  new ElementMock('div', 'screen-arena', 'screen screen--hidden');
  new ElementMock('div', 'modal-result-timeup', 'modal-overlay');
  new ElementMock('button', 'btn-timeup-next', 'btn btn-ghost');
  new ElementMock('span', 'timer-display', '');
  new ElementMock('div', 'hud-timer', '');
  new ElementMock('span', 'hud-player-name', '');
  new ElementMock('span', 'hud-balance', '');
  new ElementMock('input', 'arena-search-input', '');
  new ElementMock('button', 'btn-arena-search', '');
  new ElementMock('div', 'burned-list', '');
  new ElementMock('div', 'burned-empty-msg', '');
  new ElementMock('div', 'player-standings', '');

  const mockDocument = {
    body: new ElementMock('body'),
    documentElement: new ElementMock('html'),
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
          ss.currentPlayerIndex = (ss.currentPlayerIndex + 1) % ss.players.length;
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
      console.log(`[setInterval] Created interval #${id} for ${ms}ms`);
      return id;
    },
    clearInterval: (id) => {
      console.log(`[clearInterval] Cleared interval #${id}`);
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

  // Set up mock game session
  appState.timerEnabled = true;
  appState.timerDuration = 5; // 5 seconds duration for test
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

  console.log('Starting timer for Player 0 (Alice)...');
  vm.runInContext('startTimer()', sandbox);
  console.log(`Remaining seconds: ${appState.remainingSeconds}`);
  console.log(`Active interval count: ${activeIntervals.size}`);

  // Simulate 5 seconds ticking
  for (let sec = 1; sec <= 5; sec++) {
    console.log(`\n--- Tick ${sec} ---`);
    for (const [id, callback] of Array.from(activeIntervals.entries())) {
      callback();
    }
  }

  // Wait for async submitPlay fetch
  await new Promise(r => setTimeout(r, 100));

  const timeupModal = elementsById.get('modal-result-timeup');
  console.log('\nResult after 5 ticks:');
  console.log('TIME_UP Modal open status:', timeupModal.classList.contains('open'));
  console.log('Active interval count:', activeIntervals.size);
  console.log('Session state currentPlayerIndex:', appState.sessionState.currentPlayerIndex);
}

testBrowserTimerBehavior().catch(console.error);
