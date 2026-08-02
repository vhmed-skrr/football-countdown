/**
 * lib/scraper.js
 *
 * Retrieves player statistics for a specific competition from the static
 * per-club datasets stored in public/data/players/<clubSlug>.json.
 *
 * No live HTTP requests are made — goal totals by competition are pre-aggregated
 * in the dataset file and are looked up directly from the already-loaded player
 * record returned by playerResolver.js.
 *
 * Returns:
 *   { status: 'SUCCESS',      value: number }   — goals found for the requested league
 *   { status: 'NOT_ASSOCIATED'              }   — player has no entry for this competition
 *   { status: 'ERROR',        message: string } — missing/malformed player data
 *
 * --- NOT_ASSOCIATED vs 0-goals SUCCESS ---
 * A player record with an explicit 0 in goals_by_competition[league] is a
 * legitimate SUCCESS with value 0 (e.g. a player who played but never scored).
 * NOT_ASSOCIATED means the competition key does not exist at all in the record —
 * meaning the player has no recorded involvement in that competition at this club.
 *
 * --- Normalisation ---
 * Competition name matching is case-insensitive and normalises common variations
 * (e.g. "premier league" → "Premier League") to tolerate minor mismatches
 * between the league name stored in session state and the key used in the dataset.
 */

'use strict';

// ─────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────

/**
 * Normalise a competition name for case-insensitive matching.
 * Strips excess whitespace and lowercases the string.
 *
 * @param {string} str
 * @returns {string}
 */
function normaliseCompName(str) {
  if (!str) return '';
  return str.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Find the value for a competition in a goals_by_competition map using
 * case-insensitive key matching.
 *
 * Returns undefined if no matching key is found, or the numeric value
 * (including 0) if found.
 *
 * @param {object} goalsByComp   - { "Premier League": 186, ... }
 * @param {string} leagueName    - Competition name to look up
 * @returns {number|undefined}
 */
function _lookupCompGoals(goalsByComp, leagueName) {
  if (!goalsByComp || typeof goalsByComp !== 'object') return undefined;

  const normTarget = normaliseCompName(leagueName);

  for (const [key, value] of Object.entries(goalsByComp)) {
    if (normaliseCompName(key) === normTarget) {
      return typeof value === 'number' ? value : undefined;
    }
  }

  return undefined;
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Look up a player's goals for a specific league from their pre-loaded
 * static dataset record.
 *
 * This function is intentionally synchronous — the data is already in memory
 * (loaded and cached by playerDataStore.loadClubDataset) — but is wrapped in
 * an async function for API-level consistency with the rest of the call chain.
 *
 * @param {object} playerRecord - A player record from the static dataset.
 *   Expected shape:
 *   {
 *     name: string,
 *     goals_by_competition: { [competitionName]: number },
 *     total_goals: number
 *   }
 * @param {string} leagueName - Competition name to look up (e.g. "Premier League")
 * @returns {Promise<{ status: 'SUCCESS', value: number } | { status: 'NOT_ASSOCIATED' } | { status: 'ERROR', message: string }>}
 */
async function fetchPlayerStats(playerRecord, leagueName) {
  if (!playerRecord || typeof playerRecord !== 'object') {
    return { status: 'ERROR', message: 'fetchPlayerStats: playerRecord must be a player object from the dataset.' };
  }

  if (!leagueName || typeof leagueName !== 'string') {
    return { status: 'ERROR', message: 'fetchPlayerStats: leagueName is required.' };
  }

  const goalsByComp = playerRecord.goals_by_competition;

  if (!goalsByComp || typeof goalsByComp !== 'object') {
    return {
      status: 'ERROR',
      message: `Player "${playerRecord.name || 'unknown'}" has no goals_by_competition data in the dataset.`
    };
  }

  const value = _lookupCompGoals(goalsByComp, leagueName);

  if (value === undefined) {
    // Key not present at all → player has no recorded involvement in this competition
    return { status: 'NOT_ASSOCIATED' };
  }

  // value === 0 is a legitimate SUCCESS (player played but didn't score)
  return { status: 'SUCCESS', value };
}

module.exports = { fetchPlayerStats };
