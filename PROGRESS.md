# PROGRESS.md — football-countdown

## Group A: Backend Engine & API Architecture ✅

### A0 — Project Setup & Architecture ✅
**Status**: Complete (2026-08-01)  
Single-root Node.js/Vercel structure, `vercel.json` config, UI design system (Arabic/RTL/Light Mode as primary default), static frontend scaffolding in `public/`.

---

### A1 — Player Resolution + Fuzzy Matching ✅
**Status**: Complete (2026-08-01)  
`lib/playerResolver.js` & `lib/fuzzyMatch.js`. URL-encoding, case-insensitivity, single-match redirect detection vs multi-match search results list, Fuse.js fuzzy candidate re-ranking.

---

### A2 — Scraping Engine ✅
**Status**: Complete (2026-08-01)  
`lib/scraper.js`. HTML comment block table unpacking, multi-season goal/stat aggregation, strict `NOT_ASSOCIATED` distinction.

---

### A3 — Game Engine + Session State ✅
**Status**: Complete (2026-08-01)  
`lib/gameEngine.js`. Pure, stateless transition logic for all 7 result cases (`SUCCESS`, `BUST`, `ALREADY_BURNED`, `TIME_UP`, `WIN`, `NOT_ASSOCIATED`, `NEEDS_DISAMBIGUATION`), separate per-player burned lists (`player1BurnedList`, `player2BurnedList`).

---

### A4 — API Wiring + Disambiguation Flow ✅
**Status**: Complete (2026-08-01)  
`api/game/setup.js` & `api/game/play.js`.
- Implemented `/api/game/setup` for initializing game state with custom player names and settings.
- Implemented `/api/game/play` orchestrating `playerResolver`, `scraper`, and `gameEngine`.
- Direct `selectedPlayer` resubmission mechanism bypassing resolver after user picks candidate from `NEEDS_DISAMBIGUATION` list.
- Pre-scrape `ALREADY_BURNED` checking against both burned lists.
- Full API Contract documented in `ARCHITECTURE.md`.
- End-to-end integration walkthrough test suite created in `test-api.js` (`node test-api.js`).

#### Known Gaps & Current Project State (Honest Summary):
- **Frontend Wiring (Pending A5/A6)**: Static HTML/CSS screens exist in `public/index.html`, but client-side JavaScript (`public/scripts/app.js`) is not yet wired to call `/api/game/setup` or `/api/game/play`, update HUD state, timer, or toggle modals.
- **Serverless Fetching Layer**: FBref Cloudflare bot shield requires headless browser or scraping proxy in production. Playwright fetch fallback is configured for local testing; scraper handles 403 gracefully as an explicit error state.

---

### A5 — Frontend Build (Screen Orchestration & State Wiring) ✅
**Status**: Complete (2026-08-01)  
`public/scripts/app.js` & `public/scripts/i18n.js`.
- Fully wired all 5 UI screens (Main Menu -> Game Setup -> Pass & Play -> Arena -> Result Modals).
- In-memory state store with strictly zero usage of `localStorage` or `sessionStorage`.
- Wired Language toggle (`ar` ⇄ `en`, toggles `body.LTR`), Theme toggle (Light ⇄ Dark, toggles `data-theme="dark"` on `<html>`), and Sound mute flag (`isMuted`).
- Dynamic setup loading from `data/leagues.json` and `data/clubs.json` to populate League & Club hexagon grids.
- Player Setup Modal (2–4 players with dynamic non-empty name validation) & Game Settings Modal (timer toggle, duration, custom starting balance).
- Screen 3 Pass & Play local privacy transition displaying active player name.
- Live Arena HUD with countdown timer (`setInterval`), auto `TIME_UP` submission at 0, live burned player panel, and 300ms debounced search bar auto-suggest.
- Integrated all 7 turn result cases (`SUCCESS`, `BUST`, `ALREADY_BURNED`, `TIME_UP`, `NOT_ASSOCIATED`, `NEEDS_DISAMBIGUATION`, `WIN`) to their respective modals and resubmission flows.

#### Known Gaps & Current Project State (Honest Summary):
- **Coming Soon Placeholders**:
  - Non-Goals Categories ("Assists", "Clubs", "Nations") are visually selectable but show a "Coming Soon in MVP" notification.
  - Bottom Nav items "Leaderboard" and "Stats" trigger a "Coming Soon in MVP" notification.
- **Serverless Fetching Layer**: FBref Cloudflare bot shield requires headless browser or scraping proxy in production. Playwright fetch fallback is configured for local testing; scraper handles 403 gracefully as an explicit error state.

---

### A6 — Integration Testing & Vercel Deployment ✅
**Status**: Complete (2026-08-01)  
End-to-End local verification completed (`dev-server.js` & `test-e2e-game.js`). Pre-deploy checklist verified 100%. Git repository initialized and committed. Ready for Vercel GitHub integration or CLI deployment.

#### Honest Summary of Final MVP State & Placeholders:
- **Full Game Loop**: Works end-to-end (Main Menu -> Setup -> Pass & Play -> Arena -> 7 Result Cases -> Victory/Restart).
- **Zero Browser Storage**: Fully compliant (no `localStorage` or `sessionStorage` used).
- **Pre-deploy Checklist**: Verified `package.json` dependencies, `vercel.json` routes, `.gitignore`, relative API paths in `app.js`, and clean `data/` directory.
- **Placeholders & Known Gaps (Honest Overview)**:
  - **Sound Effects**: Mute/unmute toggle exists as an in-memory flag; audio files are not included in MVP.
  - **Challenge Categories**: Only "Goals" connects to real backend data. "Assists", "Clubs", and "Nations" are visually selectable but show "Coming Soon" notifications.
  - **Bottom Navigation**: "Leaderboard" and "Stats" trigger "Coming Soon" notifications.
  - **External Scraping**: FBref Cloudflare bot shield requires headless browser or scraping proxy in production; HTTP 403 response handled gracefully as error state.

---

## All Implementation Phases Complete 🎉

---

### Hotfix — Clubs Not Loading After League Selection (2026-08-01)

**Status**: Fixed ✅

**Root Cause**: `vercel.json` sets `"outputDirectory": "public"`, meaning only the contents of `public/` are published as browser-reachable static files. The `data/` folder was sitting at the project root — a sibling of `public/`, not inside it — so `fetch('/data/leagues.json')` and `fetch('/data/clubs.json')` both returned HTTP 404 on the deployed site. Leagues appeared to work because `loadSetupData()` already had a hardcoded fallback array for `state.leagues`; no equivalent fallback existed for `state.clubsMap`, causing the club grid to silently render empty ("Select a league first") after any league was selected.

**Fix Applied**:
1. Moved `data/leagues.json` → `public/data/leagues.json` and `data/clubs.json` → `public/data/clubs.json`. Deleted the old root-level `data/` folder entirely.
2. Verified `fetch('/data/leagues.json')` and `fetch('/data/clubs.json')` in `public/scripts/app.js` remain correct: the browser path `/data/...` now correctly resolves to `public/data/...` once `public/` is the Vercel output root.
3. Added a `state.clubsMap` fallback in `loadSetupData()` (mirroring the existing `state.leagues` fallback) covering all 6 league IDs (`pl`, `la`, `bl`, `sa`, `l1`, `cl`) — ensures graceful degradation if the static JSON files ever fail to load in future, rather than silently showing an empty club list.
4. Updated `ARCHITECTURE.md` Stack table and Project Structure diagram to document `public/data/` as the canonical data path with an explicit warning that it must not be moved back outside `public/`.

---

### Backend Overhaul — Removed Live FBref Scraping, Replaced with Static Per-Club Datasets (2026-08-01)

**Status**: Complete ✅

**Problem**: The original `lib/playerResolver.js` and `lib/scraper.js` fetched and parsed player data live from FBref.com using `axios` + `cheerio`. FBref sits behind Cloudflare bot protection that blocks requests inconsistently — sometimes 200, sometimes 403 — regardless of whether the request comes from Vercel, a local server, or other approaches. This is not a code bug; it is a fundamental architectural reliability problem.

**New Architecture**: Player data is now a static, manually-curated dataset stored as one JSON file per club at `public/data/players/<club-slug>.json`, each containing that club's roster with goals broken down by competition. All data access is file I/O — zero live HTTP requests during gameplay.

**Changes Applied**:
1. **Removed** all FBref-fetching code from `lib/playerResolver.js` (axios, cheerio, `FBREF_BASE`, `SEARCH_URL`, `BROWSER_HEADERS`, `_parseSearchResultsPage`, `_parsePlayerProfilePage`).
2. **Removed** all FBref-fetching code from `lib/scraper.js` (axios, cheerio, `loadCheerioWithComments`, `parsePlayerStats`, `fetchPlayerStats` as a live fetch). `scraper.js` now exposes only a single `fetchPlayerStats(playerRecord, leagueName)` function that looks up `goals_by_competition[leagueName]` from the already-loaded player record.
3. **Created** `lib/playerDataStore.js` — new module responsible for loading and caching per-club JSON datasets. Uses `fs.readFileSync` anchored on `process.cwd()` (project root, correct in Vercel serverless functions). Returns structured `{ ok, dataset/error }` results instead of throwing. Caches parsed files in a module-level `Map` for the lifetime of a single function invocation.
4. **Rewrote** `lib/playerResolver.js` — now loads the club dataset, builds a Fuse.js search pool from player names + all aliases, and returns `FOUND` / `UNKNOWN_PLAYER` / `ERROR`. The `translate_input()` stub is preserved unchanged. `sleep()` helper removed (no longer needed).
5. **Updated** `api/game/play.js` — passes `clubSlug` to `resolvePlayer()`, passes the full player record (not a URL) to `fetchPlayerStats()`, handles the new `UNKNOWN_PLAYER` result type.
6. **Created** `public/data/players/liverpool.json` — placeholder dataset with 4 well-known Liverpool players (Salah, Gerrard, Fowler, Ian Rush) with approximate goal numbers. Clearly marked as PLACEHOLDER DATA in the file.
7. **Removed** `cheerio` and `playwright-core` from `package.json` dependencies (no remaining usage). `axios` kept — still used by `test-e2e-game.js` as an HTTP client for local dev server POST requests.
8. **Rewrote** `test-resolver.js` and `test-scraper.js` to test the static data path with zero network calls.
9. **Updated** `ARCHITECTURE.md` with new Data Resolution Flow section, updated Project Structure, and dataset file shape documentation.

**Current State of Player Data**:
- Only Liverpool has a dataset, and it is placeholder/approximate data only — not verified from primary sources.
- Real, hand-researched datasets are the next step and are collected separately outside of code changes.
- `UNKNOWN_PLAYER` is now returned correctly by the resolver when a search matches nothing in the dataset, but the manual-addition feature (letting users add a player and their goal count on the fly) is **not yet implemented** — that is the next prompt.

**Not Changed**:
- `translate_input()` stub — preserved as-is (still relevant for future Arabic input support).
- `lib/fuzzyMatch.js` — unchanged.
- `lib/gameEngine.js` — unchanged.
- All 7 result cases (`SUCCESS`, `BUST`, `ALREADY_BURNED`, `TIME_UP`, `WIN`, `NOT_ASSOCIATED`, `NEEDS_DISAMBIGUATION`) — preserved with the same semantics.

---

### Manual Player Addition — UNKNOWN_PLAYER Flow (2026-08-01)

**Status**: Complete ✅

**Rationale**: The static player datasets are intentionally curated (~200 players per club) and not comprehensive. Unlisted squad or youth players will legitimately be missing. To address this uncertainty without penalizing players, the 8th result case (`UNKNOWN_PLAYER`) allows users to manually specify unlisted players and their goal counts for the active game session.

**Changes Applied**:
1. **Added `UNKNOWN_PLAYER` Case & `submitManualPlayer`**:
   - Added `submitManualPlayer(sessionState, playerName, goalsScored)` to `lib/gameEngine.js`.
   - Validates `goalsScored` as a non-negative integer.
   - Evaluates standard scoring logic (`SUCCESS`, `BUST`, `WIN`) and adds the manually typed player to the active player's burned list for the current session.
2. **Updated API Wiring in `api/game/play.js`**:
   - When resolver returns `UNKNOWN_PLAYER`, returns `{ resultCase: 'UNKNOWN_PLAYER', playerName: query, sessionState, message }` without scoring.
   - Added support for `{ manualEntry: true, playerName, goalsScored }` payload routing to `submitManualPlayer`.
3. **Frontend UI & Modals (`public/index.html` + `public/scripts/app.js`)**:
   - Implemented `#modal-result-unknown` with player name pre-filling, goals input, validation error display, and explicit session-only scope note.
   - Added "Add and Submit" (`#btn-unknown-submit`) and "Cancel / Try Another Name" (`#btn-unknown-cancel`) actions.
4. **Translations (`public/locales/en.json` & `public/locales/ar.json`)**:
   - Added all UI strings for `UNKNOWN_PLAYER` modal and manual submission error messages.
5. **Documentation (`ARCHITECTURE.md`)**:
   - Documented `UNKNOWN_PLAYER` as Case 8 in Core Game Rules, highlighting distinction from `NOT_ASSOCIATED`.
   - Documented in-memory session-only lifetime under Caching Strategy.

---

### Dataset Conversion — Premier League Clubs (2026-08-02)

**Status**: Complete ✅

**Details**:
1. Converted `premier_league_clubs_players.md` (1,129 total player lines across 6 Premier League clubs) into static per-club JSON datasets in `public/data/players/<club-slug>.json`:
   - `manchester-united.json` (216 players)
   - `liverpool.json` (235 players)
   - `arsenal.json` (178 players)
   - `manchester-city.json` (93 players)
   - `chelsea.json` (206 players)
   - `tottenham-hotspur.json` (201 players)
2. Strict exact deduplication rule applied (0 exact duplicates found, 0 conflicts). All low-scoring, zero-scoring, fringe, youth, and alternate name spellings preserved in full.

---

### Bug Fix — League Name Mismatch Between Datasets and Gameplay Requests (2026-08-02)

**Status**: Complete ✅

**Root Cause**:
Player search returned false `NOT_ASSOCIATED` ("Player Not Found") because `goals_by_competition` keys in generated static per-club JSON files were named `"League"`, while gameplay API requests (`api/game/play.js`) looked up competition names like `"Premier League"`. Since `"league"` and `"premier league"` do not match in `_lookupCompGoals()`, valid players were evaluated as not associated with the competition.

**Fix Applied (Approach A — Normalized Stored Keys)**:
1. Updated all per-club JSON datasets in `public/data/players/*.json` so `goals_by_competition` uses the exact real competition name (`"Premier League"` instead of `"League"`).
2. Updated `scratch/generate_json_datasets.js` to ensure all future Premier League dataset conversions map goal counts to `"Premier League"`.
3. Verified fix with unit tests (`test-resolver.js`, `test-scraper.js`) and end-to-end API play tests (`test_e2e_fix.js`, `test-api.js`), confirming player stats for `Andreas Isaksson` (0 goals), `Erling Haaland` (91 goals), `Mohamed Salah` (193 goals), `Cole Palmer` (40 goals), and `Bukayo Saka` (73 goals) return `SUCCESS` instead of false `NOT_ASSOCIATED`.
4. Kept `lib/playerResolver.js`, `lib/fuzzyMatch.js`, and `lib/playerDataStore.js` untouched as required.

---

### Per-Player Independent Balances (2026-08-02)

**Status**: Complete ✅

**Details**:
- Redesigned balance system from a single shared balance to per-player independent balances — each player now has their own balance that only they can deplete, and the first player to reach exactly 0 wins immediately. This replaces the original shared-balance race rule.
- Updated session state shape in `lib/gameEngine.js` (`createInitialState`, `evaluateTurn`, `submitManualPlayer`) to use `playerData[idx] = { balance, burnedList }`, supporting 2–4 players.
- Preserved global cross-player `ALREADY_BURNED` deduplication across all participants' burned lists.
- Updated Arena HUD, result modals, standings display, and locale text in `public/scripts/app.js`, `public/index.html`, `public/styles/main.css`, `public/locales/ar.json`, and `public/locales/en.json`.
- Updated `ARCHITECTURE.md` to reflect the new Core Game Rules and state structure.
- Updated unit test suite `test-gameEngine.js` to verify per-player balance isolation, immediate WIN triggers, and 2-4 player support.

---

### Always-Visible "Add Player Manually" Button on Arena Screen (2026-08-02)

**Status**: Complete ✅

**Details**:
- Added an always-visible, persistent "Add Player Manually" button (`#btn-arena-manual-add`) on Screen 4 Arena directly below the search bar container.
- Reachable proactively at any time during an active turn without requiring a prior failed search.
- Reuses the existing `#modal-result-unknown` modal, clearing the name input (`""`) when opened manually while preserving pre-filled search strings when opened automatically via an `UNKNOWN_PLAYER` search result.
- Submits through the existing `submitManualPlayer` workflow (`manualEntry: true` via `/api/game/play`).
- Added i18n locale keys (`arena_btn_manual_add`) in `public/locales/ar.json` and `public/locales/en.json`.
- Added styling rules (`.btn-sm`, `.arena-manual-add-wrap`) in `public/styles/main.css`.




