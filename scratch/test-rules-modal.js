const fs = require('fs');
const path = require('path');
const vm = require('vm');

async function runTests() {
  console.log('=== Starting Rules Modal Verification Tests ===\n');

  // 1. Verify Locale Files
  const arJsonPath = path.join(__dirname, '../public/locales/ar.json');
  const enJsonPath = path.join(__dirname, '../public/locales/en.json');

  const arJson = JSON.parse(fs.readFileSync(arJsonPath, 'utf8'));
  const enJson = JSON.parse(fs.readFileSync(enJsonPath, 'utf8'));

  const requiredKeys = ['btn_how_to_play', 'rules_modal_title', 'rules_p1', 'rules_p2', 'rules_p3', 'rules_p4', 'rules_p5'];
  
  console.log('1. Checking JSON locale keys...');
  requiredKeys.forEach(key => {
    if (!arJson[key]) throw new Error(`Missing key "${key}" in ar.json`);
    if (!enJson[key]) throw new Error(`Missing key "${key}" in en.json`);
  });
  console.log('   ✓ All required locale keys exist in ar.json and en.json.');

  // Verify Arabic exact source of truth text
  const arSourceP1 = "بتتنافسوا مع صحابك على مين يوصل برصيده لصفر أول. كل لاعب بيبدأ برصيد خاص بيه لوحده (بتحددوا الرقم في الإعداد، زي 700 مثلاً)، وكل واحد بيلعب برصيده هو بس — رصيدك مالوش علاقة برصيد خصمك.";
  if (arJson.rules_p1 !== arSourceP1) {
    throw new Error(`Arabic rules_p1 does not match source of truth exactly!\nExpected: ${arSourceP1}\nGot: ${arJson.rules_p1}`);
  }
  console.log('   ✓ Arabic text matches exact source of truth.\n');

  // 2. Verify HTML structure
  console.log('2. Verifying HTML structure in index.html...');
  const htmlPath = path.join(__dirname, '../public/index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  if (!html.includes('id="btn-main-rules"')) throw new Error('Missing #btn-main-rules in HTML');
  if (!html.includes('data-i18n="btn_how_to_play"')) throw new Error('Missing data-i18n="btn_how_to_play" on rules button');
  if (!html.includes('id="modal-rules"')) throw new Error('Missing #modal-rules in HTML');
  if (!html.includes('id="btn-close-rules"')) throw new Error('Missing #btn-close-rules in HTML');
  if (!html.includes('data-i18n="rules_modal_title"')) throw new Error('Missing data-i18n="rules_modal_title" in HTML');
  
  for (let i = 1; i <= 5; i++) {
    if (!html.includes(`data-i18n="rules_p${i}"`)) {
      throw new Error(`Missing data-i18n="rules_p${i}" in modal HTML`);
    }
  }
  console.log('   ✓ HTML structure correctly defines button and rules modal elements with data-i18n attributes.\n');

  // 3. Verify CSS styling rules
  console.log('3. Checking main.css for responsive scrolling & text-heavy modal styles...');
  const cssPath = path.join(__dirname, '../public/styles/main.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  if (!css.includes('.rules-body')) {
    throw new Error('main.css missing .rules-body class declaration');
  }
  if (!css.includes('max-height: 85vh') || !css.includes('overflow-y: auto')) {
    throw new Error('main.css missing modal max-height and internal scrolling declarations');
  }
  console.log('   ✓ CSS includes max-height: 85vh, overflow-y: auto, and .rules-body typography styles.\n');

  // 4. Test i18n and App.js Logic using VM context DOM Simulation
  console.log('4. Testing i18n dynamic translation & modal interaction logic (including Section 3b live language switch)...');

  // Create lightweight DOM element mock
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
      this.children = [];
      this.parentElement = null;
      this.textContent = '';
      this.eventListeners = {};
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
      child.parentElement = this;
      this.children.push(child);
    }
  }

  // Create mock DOM document
  const elementsById = new Map();
  const allElements = [];

  function registerElement(el) {
    allElements.push(el);
    if (el.id) elementsById.set(el.id, el);
    return el;
  }

  // Parse key elements from index.html into mock DOM
  const btnPlay = registerElement(new ElementMock('button', 'btn-main-play', 'btn btn-primary btn-lg'));
  btnPlay.setAttribute('data-i18n', 'btn_play');

  const btnRules = registerElement(new ElementMock('button', 'btn-main-rules', 'btn btn-ghost'));
  btnRules.setAttribute('data-i18n', 'btn_how_to_play');

  const modalRules = registerElement(new ElementMock('div', 'modal-rules', 'modal-overlay'));
  modalRules.setAttribute('role', 'dialog');

  const btnCloseRules = registerElement(new ElementMock('button', 'btn-close-rules', 'btn btn-icon'));
  
  const modalTitle = registerElement(new ElementMock('h2', 'modal-rules-title', 'modal__title'));
  modalTitle.setAttribute('data-i18n', 'rules_modal_title');

  const pElements = [];
  for (let i = 1; i <= 5; i++) {
    const p = registerElement(new ElementMock('p', `rules-p${i}`, ''));
    p.setAttribute('data-i18n', `rules_p${i}`);
    pElements.push(p);
  }

  const btnLangToggle = registerElement(new ElementMock('button', 'btn-lang-toggle', 'btn btn-ghost'));
  btnLangToggle.setAttribute('data-i18n', 'nav_lang_toggle');

  const bodyEl = registerElement(new ElementMock('body', '', ''));
  const htmlEl = registerElement(new ElementMock('html', '', ''));

  const mockDocument = {
    body: bodyEl,
    documentElement: htmlEl,
    getElementById: (id) => elementsById.get(id) || null,
    querySelectorAll: (selector) => {
      if (selector === '[data-i18n]') {
        return allElements.filter(e => e.attributes.has('data-i18n'));
      }
      if (selector === '.modal-overlay') {
        return allElements.filter(e => e.classList.contains('modal-overlay'));
      }
      return [];
    },
    addEventListener: () => {},
    dispatchEvent: () => {}
  };

  const sandbox = {
    document: mockDocument,
    window: { document: mockDocument },
    fetch: async (url) => {
      if (url.includes('/locales/ar.json')) return { ok: true, json: async () => arJson };
      if (url.includes('/locales/en.json')) return { ok: true, json: async () => enJson };
      return { ok: false };
    },
    CustomEvent: class CustomEvent {},
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout
  };

  vm.createContext(sandbox);

  // Load i18n script inside VM sandbox
  const i18nCode = fs.readFileSync(path.join(__dirname, '../public/scripts/i18n.js'), 'utf8') + '; i18n;';
  sandbox.i18n = vm.runInContext(i18nCode, sandbox);

  // Initialize i18n
  await sandbox.i18n.init();

  // Verify Arabic initial translation applied to DOM
  if (btnRules.textContent !== 'افهم اللعبة') {
    throw new Error(`Arabic i18n failed for btn_how_to_play. Got: "${btnRules.textContent}"`);
  }
  if (modalTitle.textContent !== 'إزاي تلعب') {
    throw new Error(`Arabic i18n failed for rules_modal_title. Got: "${modalTitle.textContent}"`);
  }
  if (pElements[0].textContent !== arSourceP1) {
    throw new Error(`Arabic i18n failed for rules_p1. Got: "${pElements[0].textContent}"`);
  }
  console.log('   ✓ Arabic translations initialized dynamically via i18n.applyToDOM().');

  // Load app.js code inside sandbox
  const appCode = fs.readFileSync(path.join(__dirname, '../public/scripts/app.js'), 'utf8');
  vm.runInContext(appCode, sandbox);

  // Trigger setupModalActions
  sandbox.setupModalActions();

  // Test opening modal
  btnRules.click();
  if (!modalRules.classList.contains('open')) {
    throw new Error('Clicking #btn-main-rules did not add "open" class to #modal-rules');
  }
  console.log('   ✓ Modal opens correctly when clicking #btn-main-rules.');

  // Test Live Language Switching while Modal is OPEN (Requirement 3b)
  await sandbox.i18n.setLang('en');

  if (!modalRules.classList.contains('open')) {
    throw new Error('Modal closed unexpectedly during setLang');
  }
  if (modalTitle.textContent !== 'How to Play') {
    throw new Error(`Live language switch to English failed for modal title while open. Got: "${modalTitle.textContent}"`);
  }
  if (btnRules.textContent !== 'How to Play') {
    throw new Error(`Live language switch to English failed for button. Got: "${btnRules.textContent}"`);
  }
  if (!pElements[0].textContent.includes('Compete with your friends')) {
    throw new Error(`Live language switch to English failed for rules_p1 while open. Got: "${pElements[0].textContent}"`);
  }
  console.log('   ✓ Section 3b verified: Switching language while modal is OPEN dynamically updates all modal text to English instantly without closing/reopening!');

  // Switch back to Arabic while modal is open
  await sandbox.i18n.setLang('ar');
  if (modalTitle.textContent !== 'إزاي تلعب') {
    throw new Error(`Live language switch back to Arabic failed. Got: "${modalTitle.textContent}"`);
  }
  if (pElements[0].textContent !== arSourceP1) {
    throw new Error(`Live language switch back to Arabic failed for rules_p1. Got: "${pElements[0].textContent}"`);
  }
  console.log('   ✓ Section 3b verified: Switching back to Arabic updates modal text back to Arabic instantly.');

  // Test closing modal via X button
  btnCloseRules.click();
  if (modalRules.classList.contains('open')) {
    throw new Error('Modal failed to close when X button was clicked');
  }
  console.log('   ✓ Modal closes when clicking X button.');

  // Test closing modal via overlay backdrop click
  btnRules.click(); // re-open
  if (!modalRules.classList.contains('open')) throw new Error('Modal failed to re-open');

  // Trigger backdrop click listener
  const overlayClickListeners = modalRules.eventListeners['click'] || [];
  overlayClickListeners.forEach(fn => fn({ target: modalRules }));

  if (modalRules.classList.contains('open')) {
    throw new Error('Modal failed to close when backdrop overlay was clicked');
  }
  console.log('   ✓ Modal closes when clicking outside on backdrop overlay.\n');

  console.log('====================================================');
  console.log('🎉 ALL RULES MODAL VERIFICATION TESTS PASSED 100%!');
  console.log('====================================================');
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err.message);
  process.exit(1);
});
