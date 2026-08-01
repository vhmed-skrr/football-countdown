# ARCHITECTURE.md — football-countdown

## Stack

| Layer | Technology | Notes |
|---|---|---|
| Backend | Node.js (Vercel Serverless Functions) | No Express needed; routing handled by Vercel via `/api` file structure |
| Frontend | Vanilla JS · HTML5 · CSS3 | No React/Vue — project scope does not justify a framework |
| Player Data | Static per-club JSON files (`public/data/players/`) | Pre-curated datasets; no live HTTP requests to any external source during gameplay |
| Config Data | Static JSON files (`public/data/`) | League and club list definitions; must be inside `public/` so Vercel serves them |
| Caching | None persistent | Serverless constraint — see Caching Strategy below |
| Hosting | Vercel free tier | Single project, single root, zero credit-card requirement |

---

## Project Structure

```
football-countdown/
├── package.json              # ONE file, project root — ALL dependencies live here
├── vercel.json               # Explicit routing config (outputDirectory: "public")
├── .gitignore
├── ARCHITECTURE.md           # This file
├── PROGRESS.md               # Running log of completed prompt steps
├── api/                      # Vercel auto-detects as serverless functions
│   └── game/
│       ├── setup.js          # POST /api/game/setup — initialise game session state
│       └── play.js           # POST /api/game/play  — resolve a player name, return result
├── lib/                      # Shared backend logic, imported by api/ functions
│   ├── playerResolver.js     # Name → player record (fuzzy match against static dataset)
│   ├── playerDataStore.js    # Load/cache static per-club JSON datasets from disk
│   ├── scraper.js            # Look up goals_by_competition from a loaded player record
│   ├── gameEngine.js         # Pure game-state transition logic (balance, burned lists)
│   └── fuzzyMatch.js         # Fuse.js-based fuzzy comparison utilities
└── public/                   # Frontend root — served as static files by Vercel (outputDirectory)
    ├── index.html
    ├── data/                 # Static JSON data — MUST live here, not at project root
    │   ├── leagues.json      # League definitions (id, name_ar, name_en, icon)
    │   ├── clubs.json        # Club lists keyed by league id
    │   └── players/          # Per-club player datasets — one file per club
    │       └── liverpool.json  # Example: Liverpool roster with goals_by_competition
    ├── styles/
    │   ├── main.css          # Shared variables, resets, layout primitives
    │   ├── theme-light.css   # Light mode CSS custom-property tokens (PRIMARY/default)
    │   └── theme-dark.css    # Dark mode CSS custom-property tokens (SECONDARY)
    ├── scripts/
    │   ├── app.js            # Main frontend orchestration logic
    │   └── i18n.js           # Locale dictionary loader + language toggle logic
    └── locales/
        ├── ar.json           # Arabic strings (PRIMARY/default language)
        └── en.json           # English strings (SECONDARY language)
```

**Adding a new club** requires only dropping a new `public/data/players/<club-slug>.json` file matching the documented shape — no code changes needed for new clubs, only new data files.

---

## Data Resolution Flow

No live HTTP requests to any external service occur during gameplay. All player data comes from static JSON files bundled with the deployment.

```
User types player name
        │
        ▼
 resolvePlayer(name, clubSlug)          ← lib/playerResolver.js
        │
        ├─ loadClubDataset(clubSlug)     ← lib/playerDataStore.js
        │   └─ reads public/data/players/<clubSlug>.json from disk
        │      (cached in-memory for this invocation)
        │
        ├─ Fuse.js fuzzy match against player names + aliases
        │
        ├─ Returns FOUND (1 match)       → proceed to stats lookup
        ├─ Returns FOUND (multiple)      → return NEEDS_DISAMBIGUATION to frontend
        ├─ Returns UNKNOWN_PLAYER        → player not in dataset (future: manual-addition flow)
        └─ Returns ERROR                 → dataset file missing or malformed

 FOUND (1 match)
        │
        ▼
 fetchPlayerStats(playerRecord, league)  ← lib/scraper.js
        │
        └─ looks up playerRecord.goals_by_competition[league]
           (no HTTP request — data already in memory)
           │
           ├─ key exists (even if value is 0) → SUCCESS
           └─ key absent                      → NOT_ASSOCIATED

 stat result
        │
        ▼
 evaluateTurn(sessionState, turnData)    ← lib/gameEngine.js
        └─ pure state transition → SUCCESS / BUST / WIN / etc.
```

### Per-club Dataset File Shape

```json
{
  "club": "Liverpool",
  "players": [
    {
      "name": "Mohamed Salah",
      "aliases": ["Mo Salah", "Salah"],
      "goals_by_competition": {
        "Premier League": 186,
        "Champions League": 33,
        "FA Cup": 15,
        "EFL Cup": 8
      },
      "total_goals": 242
    }
  ]
}
```

**Critical constraint**: there is exactly **one** `package.json` at the project root. No sub-folder `package.json` files exist anywhere.

---

## Core Game Rules

- **Players**: 2–4, local pass-and-play (single device is passed between players).
- **Setup**: players choose a league + club at game start (fixed for the whole game), a challenge category (Goals / Assists / Clubs / Nations), and a starting balance (default **700**).
- **Turn flow**: the active player receives the device, types a football player's name, presses Search. The backend resolves it and returns one of the eight result cases below.

### The Eight Result Cases (must be distinguished in code — never merged)

| # | Case | Condition | Effect |
|---|---|---|---|
| 1 | **SUCCESS** | Player has ≥ 1 row for that club; stat value ≤ remaining balance | Subtract stat from balance; add player to burned list; pass turn |
| 2 | **BUST** | Player has ≥ 1 row for that club; stat value > remaining balance | Balance unchanged; turn lost |
| 3 | **ALREADY_BURNED** | Player (by resolved identity, not raw string) already used this game | Reject before any data fetch |
| 4 | **TIME_UP** | Timer reached 0 before submission | Turn lost; balance unchanged |
| 5 | **WIN** | Balance reaches exactly 0 | Game ends; current player wins |
| 6 | **NOT_ASSOCIATED** | Player is in dataset but has zero recorded appearances/goals for that club | Reject with clear message; does **not** count as a turn; does **not** affect balance. Distinct from `UNKNOWN_PLAYER` |
| 7 | **NEEDS_DISAMBIGUATION** | Partial/ambiguous name → multiple candidates | Return candidate list (name + photo, no stats); wait for user selection; resubmit |
| 8 | **UNKNOWN_PLAYER** | Searched name does not match any entry in static dataset for club | Prompt user to manually enter player & goals count for current session; distinct from `NOT_ASSOCIATED` (uncertainty vs certainty) |

### Balance Aggregation

Goals (or the chosen stat) are **summed across all seasons** the player played for that specific club in that specific league. If they played for the club in multiple seasons, all seasons are summed into one total.

---

## Caching Strategy

**No persistent caching.** Vercel Serverless Functions start with a clean process on every invocation — in-memory stores and file-system writes do not reliably survive between separate calls. Therefore:

- No Redis, no file-based cache, no global in-memory LRU.
- **Per-game-session tracking** is handled purely on the **frontend**: the JavaScript client holds the full session state object (balance, both burned-player lists, current turn indicator, league/club/category selection) and sends the complete relevant state with every API request.
- The backend is **stateless**: it receives a request, computes a result, returns it, and forgets everything.
- Burned-player deduplication uses the **resolved player identity** (a canonical ID or normalised full name returned by `playerResolver`), not the raw typed string, so "Salah", "Mohamed Salah", and "محمد صلاح" all map to the same burned entry.
- Manually-added players (via the `UNKNOWN_PLAYER` flow) exist only in the current session's in-memory state and are never persisted to the static dataset files.

---

## i18n

- All frontend UI text is stored in `public/locales/ar.json` (Arabic, PRIMARY) and `public/locales/en.json` (English, SECONDARY).
- Text is **never** hardcoded inline in HTML or JS — always loaded from the active locale dictionary via `i18n.js`.
- A `translate_input()` stub must exist in `lib/` from day one for normalising player name inputs. Currently a passthrough; reserved for future Arabic-to-Latin transliteration support.
- Language toggle: toggling to English adds an `LTR` class to `<body>`; toggling back to Arabic removes it. CSS uses `:not(.LTR)` / `.LTR` selectors to flip `direction`, `text-align`, and flex/grid direction globally.

---

## UI/UX Design System

### Default State Priority Rule

| Dimension | Primary (default, zero user action) | Secondary (opt-in via toggle) |
|---|---|---|
| Language | Arabic | English |
| Direction | RTL | LTR |
| Theme | Light Mode | Dark Mode |

`<body>` carries **no extra class** by default — this IS the Arabic/RTL/Light state. All fallback/initial values in JavaScript default to Arabic/RTL/Light.

---

## API Contract

### 1. `POST /api/game/setup`

Initialises a new game session state.

#### Request Body
```json
{
  "league": "Premier League",
  "club": "Liverpool",
  "num_players": 2,
  "player_names": ["Ali", "Ahmed"],
  "starting_balance": 700,
  "category": "goals"
}
```

#### Response (HTTP 200)
```json
{
  "success": true,
  "sessionState": {
    "balance": 700,
    "players": ["Ali", "Ahmed"],
    "currentPlayerIndex": 0,
    "player1BurnedList": [],
    "player2BurnedList": [],
    "league": "Premier League",
    "club": "Liverpool",
    "category": "goals",
    "isGameOver": false,
    "winner": null
  }
}
```

---

### 2. `POST /api/game/play`

Processes a player guess or timer expiration against the current session state.

#### Request Body (Standard Search Query)
```json
{
  "sessionState": {
    "balance": 700,
    "players": ["Ali", "Ahmed"],
    "currentPlayerIndex": 0,
    "player1BurnedList": [],
    "player2BurnedList": [],
    "league": "Premier League",
    "club": "Liverpool",
    "category": "goals",
    "isGameOver": false,
    "winner": null
  },
  "playerQuery": "Mohamed",
  "timerExpired": false
}
```

#### Request Body (Resubmitting from Disambiguation Selection)
```json
{
  "sessionState": { /* ... */ },
  "selectedPlayer": {
    "name": "Mohamed Salah",
    "goals_by_competition": {
      "Premier League": 186,
      "Champions League": 33,
      "FA Cup": 15,
      "EFL Cup": 8
    },
    "total_goals": 242
  }
}
```

#### Response Shapes

##### Case: `SUCCESS`
```json
{
  "resultCase": "SUCCESS",
  "sessionState": {
    "balance": 681,
    "currentPlayerIndex": 1,
    "player1BurnedList": [
      {
        "name": "Mohamed Salah",
        "profileUrl": "https://fbref.com/en/players/e342ad68/Mohamed-Salah"
      }
    ],
    "player2BurnedList": []
  },
  "statDeducted": 186,
  "message": "Success! Subtracted 186. New balance: 514.",
  "player": {
    "name": "Mohamed Salah",
    "goals_by_competition": { "Premier League": 186, "Champions League": 33 },
    "total_goals": 242
  }
}
```

##### Case: `NEEDS_DISAMBIGUATION`
```json
{
  "resultCase": "NEEDS_DISAMBIGUATION",
  "candidates": [
    {
      "name": "Mohamed Salah",
      "goals_by_competition": { "Premier League": 186 },
      "total_goals": 242
    },
    {
      "name": "Mohamed Elneny",
      "goals_by_competition": { "Premier League": 12 },
      "total_goals": 12
    }
  ],
  "sessionState": { /* ... unchanged ... */ },
  "message": "Multiple player matches found. Please select one."
}
```

##### Case: `ALREADY_BURNED`
```json
{
  "resultCase": "ALREADY_BURNED",
  "sessionState": { /* ... unchanged ... */ },
  "player": { "name": "Mohamed Salah", "total_goals": 242 },
  "message": "Player \"Mohamed Salah\" is already burned in this game!"
}
```

##### Case: `NOT_ASSOCIATED`
```json
{
  "resultCase": "NOT_ASSOCIATED",
  "sessionState": { /* ... unchanged ... */ },
  "message": "This player has no record for the selected club in this league."
}
```

##### Case: `BUST`
```json
{
  "resultCase": "BUST",
  "sessionState": {
    "balance": 700,
    "currentPlayerIndex": 1
  },
  "message": "Bust! Stat value (750) exceeds remaining balance (700)."
}
```

##### Case: `WIN`
```json
{
  "resultCase": "WIN",
  "sessionState": {
    "balance": 0,
    "isGameOver": true,
    "winner": "Ali"
  },
  "message": "Exactly zero! Ali wins!"
}
```

##### Case: `TIME_UP`
```json
{
  "resultCase": "TIME_UP",
  "sessionState": {
    "balance": 700,
    "currentPlayerIndex": 1
  },
  "message": "Time's up! Your turn is lost."
}
```

---
