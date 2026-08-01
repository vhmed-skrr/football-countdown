// PLACEHOLDER DATA — replace with verified researched dataset before relying on this for real gameplay.
// These goal numbers are approximate/representative only and have NOT been verified from primary sources.
// They are included purely so the static data loading code path can be exercised end-to-end in tests.
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
