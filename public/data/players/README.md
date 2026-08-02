// STATIC PLAYER DATASETS — Real per-club goal data sourced from hand-collected research.
//
// Current dataset coverage (13 clubs):
//   - Premier League: Arsenal, Chelsea, Liverpool, Manchester City, Manchester United, Tottenham Hotspur
//   - La Liga: Atletico Madrid, Barcelona, Real Betis, Real Madrid, Sevilla
//   - Bundesliga: Bayern Munich, Borussia Dortmund
//
// Scope & Limitations:
//   - Goal counts reflect domestic league goal totals for each club.
//   - European competitions (e.g. Champions League) and domestic cups are currently excluded (known limitation).
//
// Data shape:
// {
//   "club": string,          — display name of the club
//   "players": [
//     {
//       "name": string,                          — canonical full name used for display and identity
//       "aliases": string[],                     — alternative names the user might type (for fuzzy matching)
//       "goals_by_competition": { [comp]: number } — total goals for this club in each competition
//       "total_goals": number                    — sum of all goals_by_competition values
//     }
//   ]
// }
