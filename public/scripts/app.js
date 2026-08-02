/**
 * app.js — Main frontend orchestration logic for Football Countdown
 *
 * Responsibilities:
 *   - Screen navigation & routing (Main Menu -> Game Setup -> Pass & Play -> Arena)
 *   - In-memory state management (no localStorage / sessionStorage per constraints)
 *   - Theme, Language, and Sound toggles
 *   - Dynamic setup loading (Leagues & Clubs JSON)
 *   - Game setup modal dialogs (Player Setup & Game Settings validation)
 *   - Pass & Play turn transitions
 *   - Live Arena gameplay: HUD, Timer countdown, Auto-suggest search, Burned panel
 *   - API integration with /api/game/setup and /api/game/play
 *   - 7 Turn Result modals handling & game loop
 */

'use strict';

// ============================================================
// In-Memory Global Application State
// ============================================================
const state = {
  // User Preferences (In-Memory Only)
  theme: 'light',      // 'light' | 'dark'
  lang: 'ar',         // 'ar' | 'en'
  isMuted: false,     // Sound mute flag

  // Setup Options
  leagues: [],
  clubsMap: {},
  selectedLeagueId: null,
  selectedClubId: null,
  selectedCategory: 'goals',
  players: ['علي', 'أحمد'],
  timerEnabled: false,
  timerDuration: 90, // seconds
  startingBalance: 700,

  // Active Game Session (received from POST /api/game/setup)
  sessionState: null,

  // Runtime Timer & Search State
  timerInterval: null,
  remainingSeconds: 0,
  searchDebounceTimer: null,
  isSubmittingPlay: false
};

// ============================================================
// Notification / Toast Helper
// ============================================================
function showToast(message) {
  let toast = document.getElementById('fc-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'fc-toast';
    toast.style.cssText = `
      position: fixed;
      bottom: 5rem;
      left: 50%;
      transform: translateX(-50%);
      padding: 0.75rem 1.5rem;
      border-radius: 9999px;
      z-index: 500;
      font-weight: bold;
      color: var(--text-primary);
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      box-shadow: var(--shadow-soft);
      pointer-events: none;
      transition: opacity 0.3s ease;
      opacity: 0;
      font-size: var(--fs-sm);
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.opacity = '1';
  clearTimeout(toast._hideTimeout);
  toast._hideTimeout = setTimeout(() => {
    toast.style.opacity = '0';
  }, 2800);
}

// ============================================================
// Screen Router & Modal Helpers
// ============================================================

/**
 * Switch active visible screen.
 * @param {'screen-menu'|'screen-setup'|'screen-pass'|'screen-arena'} screenId
 */
function showScreen(screenId) {
  const screens = ['screen-menu', 'screen-setup', 'screen-pass', 'screen-arena'];
  screens.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (id === screenId) {
        el.classList.remove('screen--hidden');
      } else {
        el.classList.add('screen--hidden');
      }
    }
  });

  // Main Navbar is shown on Screen 1 & 2 only
  const mainNav = document.getElementById('main-navbar');
  if (mainNav) {
    if (screenId === 'screen-menu' || screenId === 'screen-setup') {
      mainNav.style.display = 'flex';
    } else {
      mainNav.style.display = 'none';
    }
  }

  // Stop timer if moving away from Arena
  if (screenId !== 'screen-arena') {
    stopTimer();
  }
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('open');
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('open');
  }
}

function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.classList.remove('open');
  });
}

// ============================================================
// Global Toggles (Theme, Language, Sound)
// ============================================================

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  if (state.theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  _updateThemeToggleLabel();
}

function _updateThemeToggleLabel() {
  const isDark = state.theme === 'dark';
  const btn = document.getElementById('btn-theme-toggle');
  if (!btn) return;
  const labelKey = isDark ? 'nav_theme_toggle_light' : 'nav_theme_toggle_dark';
  btn.setAttribute('data-i18n', labelKey);
  btn.textContent = isDark ? '☀️' : '🌙';
  btn.setAttribute('aria-pressed', String(isDark));
}

async function toggleLang() {
  const nextLang = i18n.getLang() === 'ar' ? 'en' : 'ar';
  state.lang = nextLang;
  await i18n.setLang(nextLang);
  _updateThemeToggleLabel();
  _updateLangToggleLabel();
  renderLeagueGrid();
  renderClubGrid();
}

function _updateLangToggleLabel() {
  const btn = document.getElementById('btn-lang-toggle');
  if (!btn) return;
  btn.textContent = i18n.getLang() === 'ar' ? 'English' : 'عربي';
}

function toggleSound() {
  state.isMuted = !state.isMuted;
  _updateSoundToggleLabel();
  const msg = state.isMuted ? i18n.t('nav_mute') : i18n.t('nav_unmute');
  showToast(msg);
}

function _updateSoundToggleLabel() {
  const btn = document.getElementById('btn-mute-toggle');
  if (btn) {
    btn.textContent = state.isMuted ? '🔇' : '🔊';
    btn.setAttribute('aria-pressed', String(state.isMuted));
  }

  const qsBtn = document.getElementById('qs-btn-mute');
  if (qsBtn) {
    qsBtn.textContent = state.isMuted ? i18n.t('nav_unmute') : i18n.t('nav_mute');
  }
}

// ============================================================
// Setup Screen — Data Fetching & Dynamic Hex Grids
// ============================================================

async function loadSetupData() {
  try {
    const [leaguesResp, clubsResp] = await Promise.all([
      fetch('/data/leagues.json'),
      fetch('/data/clubs.json')
    ]);

    if (leaguesResp.ok && clubsResp.ok) {
      state.leagues = await leaguesResp.json();
      state.clubsMap = await clubsResp.json();
    }
  } catch (err) {
    console.error('Failed to load leagues/clubs data:', err);
  }

  // Fallback defaults if JSON fetch failed or empty
  if (!state.leagues.length) {
    state.leagues = [
      { id: 'pl', name_ar: 'البريمير ليغ', name_en: 'Premier League', icon: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
      { id: 'la', name_ar: 'لا ليغا', name_en: 'La Liga', icon: '🇪🇸' },
      { id: 'bl', name_ar: 'بوندسليغا', name_en: 'Bundesliga', icon: '🇩🇪' },
      { id: 'sa', name_ar: 'سيريا آ', name_en: 'Serie A', icon: '🇮🇹' },
      { id: 'l1', name_ar: 'ليغ 1', name_en: 'Ligue 1', icon: '🇫🇷' },
      { id: 'cl', name_ar: 'أبطال أوروبا', name_en: 'Champions League', icon: '⭐' }
    ];
  }

  // Fallback clubsMap if /data/clubs.json fetch failed or returned empty.
  // Mirrors the leagues fallback above: ensures clubs are always shown even
  // if the static file is unreachable, preventing a silent empty club grid.
  if (!state.clubsMap || Object.keys(state.clubsMap).length === 0) {
    state.clubsMap = {
      pl: [
        { id: 'mancity',   name_ar: 'مان سيتي',        name_en: 'Manchester City',   query_name: 'Manchester City',   icon: '🔵' },
        { id: 'liverpool', name_ar: 'ليفربول',          name_en: 'Liverpool',         query_name: 'Liverpool',         icon: '🔴' },
        { id: 'arsenal',   name_ar: 'أرسنال',           name_en: 'Arsenal',           query_name: 'Arsenal',           icon: '🔴' },
        { id: 'chelsea',   name_ar: 'تشيلسي',           name_en: 'Chelsea',           query_name: 'Chelsea',           icon: '🔵' },
        { id: 'manutd',    name_ar: 'مان يونايتد',      name_en: 'Manchester United', query_name: 'Manchester United', icon: '🔴' },
        { id: 'spurs',     name_ar: 'توتنهام',           name_en: 'Tottenham Hotspur', query_name: 'Tottenham',         icon: '⚪' }
      ],
      la: [
        { id: 'realmadrid', name_ar: 'ريال مدريد',      name_en: 'Real Madrid',     query_name: 'Real Madrid',     icon: '⚪' },
        { id: 'barcelona',  name_ar: 'برشلونة',          name_en: 'FC Barcelona',    query_name: 'Barcelona',       icon: '🔵🔴' },
        { id: 'atletico',   name_ar: 'أتلتيكو مدريد',   name_en: 'Atletico Madrid', query_name: 'Atletico Madrid', icon: '🔴⚪' },
        { id: 'sevilla',    name_ar: 'إشبيلية',          name_en: 'Sevilla',         query_name: 'Sevilla',         icon: '⚪🔴' },
        { id: 'betis',      name_ar: 'ريال بيتيس',       name_en: 'Real Betis',      query_name: 'Real Betis',      icon: '🟢⚪' },
        { id: 'villarreal', name_ar: 'فياريال',          name_en: 'Villarreal',      query_name: 'Villarreal',      icon: '🟡' }
      ],
      bl: [
        { id: 'bayern',     name_ar: 'بايرن ميونخ',      name_en: 'Bayern Munich',       query_name: 'Bayern Munich',       icon: '🔴' },
        { id: 'dortmund',   name_ar: 'بروسيا دورتموند',  name_en: 'Borussia Dortmund',   query_name: 'Borussia Dortmund',   icon: '🟡⚫' },
        { id: 'leverkusen', name_ar: 'باير ليفركوزن',    name_en: 'Bayer Leverkusen',    query_name: 'Bayer Leverkusen',    icon: '🔴⚫' },
        { id: 'leipzig',    name_ar: 'لايبزيغ',           name_en: 'RB Leipzig',          query_name: 'RB Leipzig',          icon: '⚪🔴' },
        { id: 'frankfurt',  name_ar: 'فرانكفورت',         name_en: 'Eintracht Frankfurt', query_name: 'Eintracht Frankfurt', icon: '🔴⚫' }
      ],
      sa: [
        { id: 'inter',    name_ar: 'إنتر ميلان',    name_en: 'Inter Milan', query_name: 'Inter',    icon: '🔵⚫' },
        { id: 'acmilan',  name_ar: 'إيه سي ميلان',  name_en: 'AC Milan',    query_name: 'Milan',    icon: '🔴⚫' },
        { id: 'juventus', name_ar: 'يوفنتوس',        name_en: 'Juventus',   query_name: 'Juventus', icon: '⚪⚫' },
        { id: 'napoli',   name_ar: 'نابولي',         name_en: 'Napoli',     query_name: 'Napoli',   icon: '🔵' },
        { id: 'roma',     name_ar: 'روما',            name_en: 'AS Roma',    query_name: 'Roma',     icon: '🟡🔴' },
        { id: 'lazio',    name_ar: 'لاتسيو',         name_en: 'Lazio',      query_name: 'Lazio',    icon: '🦅' }
      ],
      l1: [
        { id: 'psg',       name_ar: 'باريس سان جيرمان', name_en: 'PSG',       query_name: 'Paris Saint-Germain', icon: '🔵🔴' },
        { id: 'marseille', name_ar: 'مارسيليا',           name_en: 'Marseille', query_name: 'Marseille',          icon: '⚪🔵' },
        { id: 'lyon',      name_ar: 'ليون',               name_en: 'Lyon',      query_name: 'Lyon',               icon: '🔴🔵' },
        { id: 'monaco',    name_ar: 'موناكو',              name_en: 'Monaco',    query_name: 'Monaco',             icon: '🔴⚪' },
        { id: 'lille',     name_ar: 'ليل',                name_en: 'Lille',     query_name: 'Lille',              icon: '🔴' }
      ],
      cl: [
        { id: 'realmadrid', name_ar: 'ريال مدريد',      name_en: 'Real Madrid',       query_name: 'Real Madrid',       icon: '👑' },
        { id: 'mancity',    name_ar: 'مان سيتي',         name_en: 'Manchester City',   query_name: 'Manchester City',   icon: '🔵' },
        { id: 'bayern',     name_ar: 'بايرن ميونخ',      name_en: 'Bayern Munich',     query_name: 'Bayern Munich',     icon: '🔴' },
        { id: 'psg',        name_ar: 'باريس سان جيرمان', name_en: 'PSG',               query_name: 'Paris Saint-Germain', icon: '🔵🔴' },
        { id: 'inter',      name_ar: 'إنتر ميلان',       name_en: 'Inter Milan',       query_name: 'Inter',             icon: '🔵⚫' },
        { id: 'liverpool',  name_ar: 'ليفربول',           name_en: 'Liverpool',         query_name: 'Liverpool',         icon: '🔴' }
      ]
    };
  }

  // Select default first league & club
  state.selectedLeagueId = 'pl';
  renderLeagueGrid();
  renderClubGrid();
  if (state.clubsMap['pl'] && state.clubsMap['pl'].length > 1) {
    selectClub(state.clubsMap['pl'][1].id); // default Liverpool
  }
}

function renderLeagueGrid() {
  const grid = document.getElementById('league-grid');
  if (!grid) return;

  const currentLang = i18n.getLang();
  grid.innerHTML = '';

  state.leagues.forEach(league => {
    const btn = document.createElement('button');
    const isSelected = league.id === state.selectedLeagueId;
    btn.className = `hex-btn ${isSelected ? 'selected' : ''}`;
    btn.setAttribute('aria-pressed', String(isSelected));
    btn.setAttribute('data-league', league.id);

    const name = currentLang === 'en' ? league.name_en : league.name_ar;
    btn.innerHTML = `<span class="hex-icon">${league.icon || '⚽'}</span><span>${name}</span>`;

    btn.addEventListener('click', () => selectLeague(league.id));
    grid.appendChild(btn);
  });
}

function selectLeague(leagueId) {
  state.selectedLeagueId = leagueId;
  state.selectedClubId = null;
  renderLeagueGrid();
  renderClubGrid();
}

function renderClubGrid() {
  const grid = document.getElementById('club-grid');
  if (!grid) return;

  const currentLang = i18n.getLang();
  grid.innerHTML = '';

  const clubs = state.clubsMap[state.selectedLeagueId] || [];

  if (clubs.length === 0) {
    grid.innerHTML = `<p class="text-muted fs-sm">${i18n.t('setup_club_disabled')}</p>`;
    return;
  }

  clubs.forEach(club => {
    const btn = document.createElement('button');
    const isSelected = club.id === state.selectedClubId;
    btn.className = `hex-btn ${isSelected ? 'selected' : ''}`;
    btn.setAttribute('aria-pressed', String(isSelected));
    btn.setAttribute('data-club', club.id);

    const name = currentLang === 'en' ? club.name_en : club.name_ar;
    btn.innerHTML = `<span class="hex-icon">${club.icon || '⚽'}</span><span>${name}</span>`;

    btn.addEventListener('click', () => selectClub(club.id));
    grid.appendChild(btn);
  });
}

function selectClub(clubId) {
  state.selectedClubId = clubId;
  renderClubGrid();
}

function setupCategorySelection() {
  const setupCatGrid = document.getElementById('category-grid');
  const arenaCatGrid = document.getElementById('arena-category-grid');

  const handleCategoryClick = (catBtn, container) => {
    const cat = catBtn.getAttribute('data-category');
    if (!cat) return;

    state.selectedCategory = cat;

    // Update active class on grid
    container.querySelectorAll('.hex-btn').forEach(btn => {
      const isTarget = btn.getAttribute('data-category') === cat;
      btn.classList.toggle('selected', isTarget);
      btn.setAttribute('aria-pressed', String(isTarget));
    });

    // Notify if non-Goals category selected
    if (cat !== 'goals') {
      const catName = i18n.t(`setup_category_${cat}`);
      showToast(`${catName}: ${i18n.getLang() === 'en' ? 'Coming Soon in MVP!' : 'ميزة قادمة قريباً!'}`);
    }
  };

  if (setupCatGrid) {
    setupCatGrid.querySelectorAll('.hex-btn').forEach(btn => {
      btn.addEventListener('click', () => handleCategoryClick(btn, setupCatGrid));
    });
  }

  if (arenaCatGrid) {
    arenaCatGrid.querySelectorAll('.hex-btn').forEach(btn => {
      btn.addEventListener('click', () => handleCategoryClick(btn, arenaCatGrid));
    });
  }
}

// ============================================================
// Setup Modals — Player Setup & Game Settings Validation
// ============================================================

function setupPlayerModal() {
  const openBtn = document.getElementById('btn-player-setup');
  const closeBtn = document.getElementById('btn-close-player-setup');
  const cancelBtn = document.getElementById('btn-cancel-player-setup');
  const confirmBtn = document.getElementById('btn-confirm-player-setup');
  const countSelect = document.getElementById('player-count');
  const fieldsContainer = document.getElementById('player-name-fields');

  const renderNameFields = (count) => {
    if (!fieldsContainer) return;
    fieldsContainer.innerHTML = '';

    for (let i = 1; i <= count; i++) {
      const label = document.createElement('label');
      label.className = 'setup-section__label mt-2';
      label.setAttribute('for', `player-name-${i}`);
      label.textContent = i18n.t('setup_player_name_label', { n: i });

      const input = document.createElement('input');
      input.id = `player-name-${i}`;
      input.type = 'text';
      input.className = 'input';
      input.value = state.players[i - 1] || `${i18n.getLang() === 'en' ? 'Player' : 'لاعب'} ${i}`;
      input.placeholder = i18n.getLang() === 'en' ? 'Enter name' : 'أدخل الاسم';

      fieldsContainer.appendChild(label);
      fieldsContainer.appendChild(input);
    }
  };

  if (openBtn) {
    openBtn.addEventListener('click', () => {
      if (countSelect) countSelect.value = String(state.players.length);
      renderNameFields(state.players.length);
      openModal('modal-player-setup');
    });
  }

  if (countSelect) {
    countSelect.addEventListener('change', (e) => {
      const count = parseInt(e.target.value, 10) || 2;
      renderNameFields(count);
    });
  }

  if (closeBtn) closeBtn.addEventListener('click', () => closeModal('modal-player-setup'));
  if (cancelBtn) cancelBtn.addEventListener('click', () => closeModal('modal-player-setup'));

  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      const count = parseInt(countSelect.value, 10) || 2;
      const newNames = [];
      let isValid = true;

      for (let i = 1; i <= count; i++) {
        const input = document.getElementById(`player-name-${i}`);
        const val = input ? input.value.trim() : '';
        if (!val) {
          isValid = false;
          if (input) input.style.borderColor = 'var(--accent-danger)';
        } else {
          if (input) input.style.borderColor = '';
          newNames.push(val);
        }
      }

      if (!isValid) {
        showToast(i18n.getLang() === 'en' ? 'Please fill in all player names' : 'الرجاء إدخال أسماء جميع اللاعبين');
        return;
      }

      state.players = newNames;
      closeModal('modal-player-setup');
      showToast(i18n.getLang() === 'en' ? 'Player settings saved' : 'تم حفظ إعدادات اللاعبين');
    });
  }
}

function setupSettingsModal() {
  const openBtn = document.getElementById('btn-game-settings');
  const closeBtn = document.getElementById('btn-close-game-settings');
  const cancelBtn = document.getElementById('btn-cancel-game-settings');
  const confirmBtn = document.getElementById('btn-confirm-game-settings');
  const timerToggle = document.getElementById('toggle-timer');
  const durationWrap = document.getElementById('timer-duration-wrap');
  const durationSelect = document.getElementById('timer-duration');
  const balanceInput = document.getElementById('start-balance');

  if (openBtn) {
    openBtn.addEventListener('click', () => {
      if (timerToggle) {
        timerToggle.checked = state.timerEnabled;
        if (durationWrap) durationWrap.hidden = !state.timerEnabled;
      }
      if (durationSelect) durationSelect.value = String(state.timerDuration);
      if (balanceInput) balanceInput.value = String(state.startingBalance);
      openModal('modal-game-settings');
    });
  }

  if (timerToggle && durationWrap) {
    timerToggle.addEventListener('change', () => {
      durationWrap.hidden = !timerToggle.checked;
    });
  }

  if (closeBtn) closeBtn.addEventListener('click', () => closeModal('modal-game-settings'));
  if (cancelBtn) cancelBtn.addEventListener('click', () => closeModal('modal-game-settings'));

  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      const balance = parseInt(balanceInput.value, 10);
      if (isNaN(balance) || balance <= 0) {
        showToast(i18n.getLang() === 'en' ? 'Enter a valid positive balance' : 'أدخل رصيداً صحيحاً أكبر من صفر');
        if (balanceInput) balanceInput.style.borderColor = 'var(--accent-danger)';
        return;
      }

      if (balanceInput) balanceInput.style.borderColor = '';
      state.startingBalance = balance;
      state.timerEnabled = timerToggle ? timerToggle.checked : false;
      state.timerDuration = durationSelect ? parseInt(durationSelect.value, 10) : 90;

      closeModal('modal-game-settings');
      showToast(i18n.getLang() === 'en' ? 'Game settings saved' : 'تم حفظ إعدادات اللعبة');
    });
  }
}

// ============================================================
// Start Game API Action
// ============================================================

async function handleStartGame() {
  if (!state.selectedLeagueId || !state.selectedClubId) {
    showToast(i18n.getLang() === 'en' ? 'Please select a league and club' : 'الرجاء اختيار الدوري والنادي');
    return;
  }

  const leagueObj = state.leagues.find(l => l.id === state.selectedLeagueId);
  const clubsInLeague = state.clubsMap[state.selectedLeagueId] || [];
  const clubObj = clubsInLeague.find(c => c.id === state.selectedClubId);

  const leagueName = leagueObj ? leagueObj.name_en : state.selectedLeagueId;
  const clubQueryName = clubObj ? (clubObj.query_name || clubObj.name_en) : state.selectedClubId;

  const payload = {
    league: leagueName,
    club: clubQueryName,
    num_players: state.players.length,
    player_names: state.players,
    starting_balance: state.startingBalance,
    category: state.selectedCategory
  };

  const startBtn = document.getElementById('btn-start-game');
  if (startBtn) startBtn.disabled = true;

  try {
    const resp = await fetch('/api/game/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await resp.json();

    if (resp.ok && data.success && data.sessionState) {
      state.sessionState = data.sessionState;
      preparePassAndPlayScreen();
      showScreen('screen-pass');
    } else {
      showToast(data.message || (i18n.getLang() === 'en' ? 'Failed to start game' : 'فشل بدء اللعبة'));
    }
  } catch (err) {
    console.error('Error starting game session:', err);
    showToast(i18n.getLang() === 'en' ? 'Network error starting game' : 'خطأ في الاتصال أثناء بدء اللعبة');
  } finally {
    if (startBtn) startBtn.disabled = false;
  }
}

// ============================================================
// Screen 3 — Pass & Play Screen
// ============================================================

function preparePassAndPlayScreen() {
  if (!state.sessionState) return;

  const activeIdx = state.sessionState.currentPlayerIndex || 0;
  const activeName = (state.sessionState.players && state.sessionState.players[activeIdx]) || `Player ${activeIdx + 1}`;

  const nameEl = document.getElementById('pass-player-name');
  if (nameEl) nameEl.textContent = activeName;
}

function handleReadyClick() {
  prepareArenaScreen();
  showScreen('screen-arena');
  if (state.timerEnabled) {
    startTimer();
  }
}

// ============================================================
// Screen 4 — Arena (HUD, Timer, Search, Burned Panel)
// ============================================================

function prepareArenaScreen() {
  if (!state.sessionState) return;

  // Update HUD
  const activeIdx = state.sessionState.currentPlayerIndex || 0;
  const activeName = (state.sessionState.players && state.sessionState.players[activeIdx]) || `Player ${activeIdx + 1}`;

  const hudPlayer = document.getElementById('hud-player-name');
  if (hudPlayer) hudPlayer.textContent = activeName;

  const hudBalance = document.getElementById('hud-balance');
  if (hudBalance) hudBalance.textContent = String(state.sessionState.balance);

  // Update Timer display
  const timerDisplay = document.getElementById('timer-display');
  const hudTimer = document.getElementById('hud-timer');

  if (!state.timerEnabled) {
    if (timerDisplay) timerDisplay.textContent = '∞';
    if (hudTimer) hudTimer.style.opacity = '0.6';
  } else {
    if (hudTimer) hudTimer.style.opacity = '1';
    state.remainingSeconds = state.timerDuration;
    updateTimerDisplay();
  }

  // Clear search input & suggestions
  const searchInput = document.getElementById('arena-search-input');
  if (searchInput) searchInput.value = '';
  hideSuggestions();

  // Render Burned Players Panel
  renderBurnedPanel();
}

function startTimer() {
  stopTimer();
  state.remainingSeconds = state.timerDuration;
  updateTimerDisplay();

  state.timerInterval = setInterval(() => {
    state.remainingSeconds--;
    updateTimerDisplay();

    if (state.remainingSeconds <= 0) {
      stopTimer();
      // Automatic TIME_UP submission
      submitPlay(null, true);
    }
  }, 1000);
}

function stopTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

function updateTimerDisplay() {
  const timerDisplay = document.getElementById('timer-display');
  if (!timerDisplay) return;

  if (!state.timerEnabled) {
    timerDisplay.textContent = '∞';
    return;
  }

  const mins = Math.floor(Math.max(0, state.remainingSeconds) / 60);
  const secs = Math.max(0, state.remainingSeconds) % 60;
  const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  timerDisplay.textContent = formatted;
}

function renderBurnedPanel() {
  const listEl = document.getElementById('burned-list');
  const emptyMsg = document.getElementById('burned-empty-msg');
  if (!listEl || !state.sessionState) return;

  listEl.innerHTML = '';

  const p1List = state.sessionState.player1BurnedList || [];
  const p2List = state.sessionState.player2BurnedList || [];
  const p3List = state.sessionState.player3BurnedList || [];
  const p4List = state.sessionState.player4BurnedList || [];

  const allBurned = [
    ...p1List.map(item => ({ ...item, p: 1 })),
    ...p2List.map(item => ({ ...item, p: 2 })),
    ...p3List.map(item => ({ ...item, p: 3 })),
    ...p4List.map(item => ({ ...item, p: 4 }))
  ];

  if (allBurned.length === 0) {
    if (emptyMsg) emptyMsg.style.display = 'block';
    return;
  }

  if (emptyMsg) emptyMsg.style.display = 'none';

  allBurned.forEach(entry => {
    const li = document.createElement('li');
    li.className = 'burned-entry';
    const pName = (state.sessionState.players && state.sessionState.players[entry.p - 1]) || `P${entry.p}`;
    const nameStr = entry.name || (typeof entry === 'string' ? entry : 'Player');

    li.innerHTML = `
      <span class="burned-entry__flame" aria-hidden="true">🔥</span>
      <span>${nameStr} <small class="text-muted">(${pName})</small></span>
    `;
    listEl.appendChild(li);
  });
}

// ============================================================
// Arena Search & Auto-Suggest (Debounced)
// ============================================================

function setupArenaSearch() {
  const searchInput = document.getElementById('arena-search-input');
  const searchBtn = document.getElementById('btn-arena-search');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      clearTimeout(state.searchDebounceTimer);

      if (val.length < 2) {
        hideSuggestions();
        return;
      }

      state.searchDebounceTimer = setTimeout(() => {
        fetchAutoSuggestions(val);
      }, 300); // 300ms debounce
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const query = searchInput.value.trim();
        if (query) {
          hideSuggestions();
          submitPlay(query, false);
        }
      }
    });
  }

  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      const query = searchInput ? searchInput.value.trim() : '';
      if (query) {
        hideSuggestions();
        submitPlay(query, false);
      }
    });
  }
}

function fetchAutoSuggestions(query) {
  const suggestEl = document.getElementById('arena-suggest');
  if (!suggestEl) return;

  // Render client-side quick suggestions / candidates preview
  suggestEl.hidden = false;
  suggestEl.setAttribute('aria-expanded', 'true');

  const samplePlayers = [
    { name: 'Mohamed Salah', meta: 'Liverpool · Forward' },
    { name: 'Erling Haaland', meta: 'Manchester City · Forward' },
    { name: 'Kevin De Bruyne', meta: 'Manchester City · Midfielder' },
    { name: 'Bukayo Saka', meta: 'Arsenal · Forward' },
    { name: 'Marcus Rashford', meta: 'Manchester United · Forward' },
    { name: 'Son Heung-min', meta: 'Tottenham · Forward' },
    { name: 'Virgil van Dijk', meta: 'Liverpool · Defender' }
  ];

  const matches = samplePlayers.filter(p => p.name.toLowerCase().includes(query.toLowerCase()));

  let html = '';
  if (matches.length > 0) {
    matches.forEach(item => {
      html += `
        <div class="arena-suggest__item" role="option" tabindex="0" data-name="${item.name}">
          <span>⚽ ${item.name}</span>
          <small class="text-muted fs-xs">${item.meta}</small>
        </div>
      `;
    });
  } else {
    html = `
      <div class="arena-suggest__item" role="option" tabindex="0" data-name="${query}">
        <span>⚽ "${query}"</span>
        <small class="text-muted fs-xs">${i18n.getLang() === 'en' ? 'Search backend...' : 'بحث في القاعدة...'}</small>
      </div>
    `;
  }

  suggestEl.innerHTML = html;

  // Add click handlers on suggestion items
  suggestEl.querySelectorAll('.arena-suggest__item').forEach(item => {
    item.addEventListener('click', () => {
      const chosenName = item.getAttribute('data-name');
      const searchInput = document.getElementById('arena-search-input');
      if (searchInput) searchInput.value = chosenName;
      hideSuggestions();
      submitPlay(chosenName, false);
    });
  });
}

function hideSuggestions() {
  const suggestEl = document.getElementById('arena-suggest');
  if (suggestEl) {
    suggestEl.hidden = true;
    suggestEl.setAttribute('aria-expanded', 'false');
  }
}

// ============================================================
// Play Submission & Game Loop Execution (`POST /api/game/play`)
// ============================================================

async function submitPlay(playerQuery, timerExpired = false, selectedPlayer = null) {
  if (state.isSubmittingPlay || !state.sessionState) return;

  state.isSubmittingPlay = true;
  stopTimer();

  const searchBtn = document.getElementById('btn-arena-search');
  if (searchBtn) searchBtn.disabled = true;

  const payload = {
    sessionState: state.sessionState,
    playerQuery: playerQuery || null,
    timerExpired: !!timerExpired,
    selectedPlayer: selectedPlayer || null
  };

  try {
    const resp = await fetch('/api/game/play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await resp.json();

    if (data.sessionState) {
      state.sessionState = data.sessionState;
    }

    handleTurnResult(data, playerQuery);
  } catch (err) {
    console.error('Error executing play turn:', err);
    showToast(i18n.getLang() === 'en' ? 'Network error resolving play' : 'خطأ في الاتصال أثناء تنفيذ اللعبة');
  } finally {
    state.isSubmittingPlay = false;
    if (searchBtn) searchBtn.disabled = false;
  }
}

// ============================================================
// Handle 7 Turn Result Modal Cases
// ============================================================

function handleTurnResult(response, querySubmitted) {
  const resultCase = response.resultCase;

  switch (resultCase) {
    case 'SUCCESS': {
      openModal('modal-result-success');

      const photoEl = document.getElementById('success-player-photo');
      if (photoEl) {
        photoEl.src = (response.player && response.player.photoUrl) || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24"><text y="20" font-size="20">⚽</text></svg>';
        photoEl.alt = response.player ? response.player.name : '';
      }

      const nameEl = document.getElementById('success-player-name');
      if (nameEl) nameEl.textContent = (response.player && response.player.name) || querySubmitted || 'Player';

      const clubEl = document.getElementById('success-player-club');
      if (clubEl && state.sessionState) {
        clubEl.textContent = `${state.sessionState.club || ''} · ${state.sessionState.league || ''}`;
      }

      const statEl = document.getElementById('success-stat-value');
      if (statEl) statEl.textContent = String(response.statDeducted || 0);

      const balEl = document.getElementById('success-new-balance');
      if (balEl && state.sessionState) balEl.textContent = String(state.sessionState.balance);

      break;
    }

    case 'BUST': {
      openModal('modal-result-bust');
      const balEl = document.getElementById('bust-balance');
      if (balEl && state.sessionState) balEl.textContent = String(state.sessionState.balance);
      break;
    }

    case 'TIME_UP': {
      openModal('modal-result-timeup');
      break;
    }

    case 'ALREADY_BURNED': {
      openModal('modal-result-burned');
      const nameEl = document.getElementById('burned-player-name');
      if (nameEl) nameEl.textContent = (response.player && response.player.name) || querySubmitted || '';
      break;
    }

    case 'NOT_ASSOCIATED': {
      openModal('modal-result-not-associated');
      const nameEl = document.getElementById('not-assoc-player-name');
      if (nameEl) nameEl.textContent = querySubmitted || (response.player && response.player.name) || '';
      break;
    }

    case 'NEEDS_DISAMBIGUATION': {
      openModal('modal-result-disambiguation');
      renderDisambiguationList(response.candidates || []);
      break;
    }

    case 'WIN': {
      openModal('modal-result-win');
      const nameEl = document.getElementById('win-player-name');
      if (nameEl) nameEl.textContent = response.sessionState.winner || 'Winner!';
      break;
    }

    default: {
      showToast(response.message || 'Turn completed');
      break;
    }
  }
}

function renderDisambiguationList(candidates) {
  const listEl = document.getElementById('disambig-list');
  if (!listEl) return;

  listEl.innerHTML = '';

  candidates.forEach(cand => {
    const item = document.createElement('div');
    item.className = 'disambiguation-item';
    item.setAttribute('role', 'option');
    item.setAttribute('tabindex', '0');

    const photoUrl = cand.photoUrl || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24"><text y="20" font-size="20">⚽</text></svg>';

    item.innerHTML = `
      <img src="${photoUrl}" alt="${cand.name}" width="48" height="48" loading="lazy" />
      <div class="disambiguation-item__info">
        <span class="disambiguation-item__name">${cand.name}</span>
        <span class="disambiguation-item__meta">${cand.meta || `${state.sessionState.club || ''} · ${state.sessionState.league || ''}`}</span>
      </div>
    `;

    item.addEventListener('click', () => {
      closeModal('modal-result-disambiguation');
      submitPlay(null, false, cand);
    });

    listEl.appendChild(item);
  });
}

// ============================================================
// Wire Modal Next/Retry/Close Action Buttons
// ============================================================

function setupModalActions() {
  // SUCCESS -> Next Turn -> Pass & Play Screen
  const successNextBtn = document.getElementById('btn-success-next');
  if (successNextBtn) {
    successNextBtn.addEventListener('click', () => {
      closeModal('modal-result-success');
      preparePassAndPlayScreen();
      showScreen('screen-pass');
    });
  }

  // BUST -> Next Turn -> Pass & Play Screen
  const bustNextBtn = document.getElementById('btn-bust-next');
  if (bustNextBtn) {
    bustNextBtn.addEventListener('click', () => {
      closeModal('modal-result-bust');
      preparePassAndPlayScreen();
      showScreen('screen-pass');
    });
  }

  // TIME_UP -> Next Turn -> Pass & Play Screen
  const timeupNextBtn = document.getElementById('btn-timeup-next');
  if (timeupNextBtn) {
    timeupNextBtn.addEventListener('click', () => {
      closeModal('modal-result-timeup');
      preparePassAndPlayScreen();
      showScreen('screen-pass');
    });
  }

  // ALREADY_BURNED -> Try Again -> Stays on Screen 4 Arena
  const burnedRetryBtn = document.getElementById('btn-burned-retry');
  if (burnedRetryBtn) {
    burnedRetryBtn.addEventListener('click', () => {
      closeModal('modal-result-burned');
      if (state.timerEnabled) startTimer();
      const input = document.getElementById('arena-search-input');
      if (input) input.focus();
    });
  }

  // NOT_ASSOCIATED -> Try Again -> Stays on Screen 4 Arena
  const notAssocRetryBtn = document.getElementById('btn-notassoc-retry');
  if (notAssocRetryBtn) {
    notAssocRetryBtn.addEventListener('click', () => {
      closeModal('modal-result-not-associated');
      if (state.timerEnabled) startTimer();
      const input = document.getElementById('arena-search-input');
      if (input) input.focus();
    });
  }

  // DISAMBIGUATION Close Button
  const closeDisambigBtn = document.getElementById('btn-close-disambig');
  if (closeDisambigBtn) {
    closeDisambigBtn.addEventListener('click', () => {
      closeModal('modal-result-disambiguation');
      if (state.timerEnabled) startTimer();
    });
  }

  // WIN -> Play Again -> Screen 1 Main Menu
  const winAgainBtn = document.getElementById('btn-win-again');
  if (winAgainBtn) {
    winAgainBtn.addEventListener('click', () => {
      closeModal('modal-result-win');
      state.sessionState = null;
      showScreen('screen-menu');
    });
  }

  // Quick Settings (Arena ⚙️)
  const closeQsBtn = document.getElementById('btn-close-quick-settings');
  if (closeQsBtn) closeQsBtn.addEventListener('click', () => closeModal('modal-quick-settings'));

  const qsMuteBtn = document.getElementById('qs-btn-mute');
  if (qsMuteBtn) qsMuteBtn.addEventListener('click', toggleSound);

  const qsCategoryBtn = document.getElementById('qs-btn-category');
  if (qsCategoryBtn) {
    qsCategoryBtn.addEventListener('click', () => {
      closeModal('modal-quick-settings');
      showToast(i18n.getLang() === 'en' ? 'Select challenge category below search bar' : 'اختر نوع التحدي من أسفل شريط البحث');
    });
  }

  const qsQuitBtn = document.getElementById('qs-btn-quit');
  if (qsQuitBtn) {
    qsQuitBtn.addEventListener('click', () => {
      closeModal('modal-quick-settings');
      stopTimer();
      state.sessionState = null;
      showScreen('screen-menu');
    });
  }
}

// ============================================================
// Setup Bottom Navigation Bar & Placeholders
// ============================================================

function setupHowToPlayModal() {
  const openBtn = document.getElementById('btn-main-how-to-play');
  const closeBtn = document.getElementById('btn-close-how-to-play');
  const modal = document.getElementById('modal-how-to-play');

  if (openBtn) {
    openBtn.addEventListener('click', () => openModal('modal-how-to-play'));
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => closeModal('modal-how-to-play'));
  }

  if (modal) {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        closeModal('modal-how-to-play');
      }
    });
  }
}

function setupBottomNav() {
  const navArena = document.getElementById('nav-arena');
  const navLeaderboard = document.getElementById('nav-leaderboard');
  const navStats = document.getElementById('nav-stats');
  const navSettings = document.getElementById('nav-settings');

  if (navArena) {
    navArena.addEventListener('click', () => {
      showScreen('screen-arena');
    });
  }

  if (navLeaderboard) {
    navLeaderboard.addEventListener('click', () => {
      showToast(i18n.getLang() === 'en' ? 'Leaderboard: Coming Soon in MVP!' : 'قائمة الترتيب: قريباً!');
    });
  }

  if (navStats) {
    navStats.addEventListener('click', () => {
      showToast(i18n.getLang() === 'en' ? 'Statistics: Coming Soon in MVP!' : 'الإحصائيات: قريباً!');
    });
  }

  if (navSettings) {
    navSettings.addEventListener('click', () => {
      openModal('modal-quick-settings');
    });
  }
}

// ============================================================
// DOMContentLoaded Initialization Bootstrap
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  await i18n.init().catch(err => console.error('i18n init failed:', err));

  // Wire Navbar buttons
  const playBtn = document.getElementById('btn-main-play');
  if (playBtn) playBtn.addEventListener('click', () => showScreen('screen-setup'));

  const themeBtn = document.getElementById('btn-theme-toggle');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

  const langBtn = document.getElementById('btn-lang-toggle');
  if (langBtn) langBtn.addEventListener('click', toggleLang);

  const muteBtn = document.getElementById('btn-mute-toggle');
  if (muteBtn) muteBtn.addEventListener('click', toggleSound);

  const startBtn = document.getElementById('btn-start-game');
  if (startBtn) startBtn.addEventListener('click', handleStartGame);

  const passReadyBtn = document.getElementById('btn-pass-ready');
  if (passReadyBtn) passReadyBtn.addEventListener('click', handleReadyClick);

  // Setup subsystem handlers
  setupCategorySelection();
  setupPlayerModal();
  setupSettingsModal();
  setupHowToPlayModal();
  setupArenaSearch();
  setupModalActions();
  setupBottomNav();

  // Load setup data (leagues and clubs JSON)
  loadSetupData();

  // Initial Screen State
  showScreen('screen-menu');
});
