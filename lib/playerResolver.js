/**
 * lib/playerResolver.js
 *
 * Resolves a raw player name string (possibly partial, misspelled, or an alias)
 * to one or more player records from the static per-club dataset loaded by
 * lib/playerDataStore.js.
 *
 * No live HTTP requests are made — all data is read from
 * public/data/players/<clubSlug>.json at request time.
 *
 * Result types returned by resolvePlayer():
 *   { type: 'FOUND',          players: [PlayerRecord, ...] }  — 1+ matches found
 *   { type: 'UNKNOWN_PLAYER'                                }  — no match found at all
 *   { type: 'ERROR',          message: string              }  — dataset load / config error
 *
 * PlayerRecord shape (subset returned to callers):
 *   {
 *     name:                string,   // Canonical full name (from dataset)
 *     goals_by_competition: object,  // { "Premier League": 186, ... }
 *     total_goals:          number
 *   }
 *
 * --- Why UNKNOWN_PLAYER instead of NOT_FOUND ---
 * UNKNOWN_PLAYER is a distinct result type (vs the old NOT_FOUND) because it
 * signals a different semantic: the search string did not match any entry in
 * the current club's static dataset, which may mean the player has simply not
 * been added yet.  This distinction is intentional groundwork for a future
 * manual-addition feature.  For now, UNKNOWN_PLAYER is returned and surfaced
 * to the user as a clear message; no additional action is taken here.
 */

'use strict';

const { loadClubDataset } = require('./playerDataStore');
const { fuzzySearch } = require('./fuzzyMatch');

// ─────────────────────────────────────────────────────────────
// translate_input — normalisation stub (reserved for Arabic ↔ Latin support)
// ─────────────────────────────────────────────────────────────

/**
 * Normalise a player name input string before sending it to the resolver.
 * Currently a passthrough — reserved for future Arabic-to-Latin transliteration.
 *
 * @param {string} rawInput
 * @returns {string}
 */
function translate_input(rawInput) {
  return (rawInput || '').trim();
}

// ─────────────────────────────────────────────────────────────
// Internal: build the fuzzy-searchable candidate pool
// ─────────────────────────────────────────────────────────────

/**
 * Expand a player record into one search entry per name/alias so that a match
 * on ANY alias resolves back to the canonical player record.
 *
 * Each entry carries:
 *   { searchName: string,   // The name/alias string to match against
 *     player: object        // Reference to the original player record
 *   }
 *
 * @param {object[]} players - Array of player records from the dataset
 * @returns {object[]}
 */
function _buildSearchPool(players) {
  const pool = [];
  for (const player of players) {
    // Primary name
    pool.push({ searchName: player.name, player });
    // Each alias
    if (Array.isArray(player.aliases)) {
      for (const alias of player.aliases) {
        if (alias) pool.push({ searchName: alias, player });
      }
    }
  }
  return pool;
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Resolve a raw player name to one or more player records from the club's
 * static dataset, using Fuse.js fuzzy matching against names AND aliases.
 *
 * @param {string} rawName  - Player name as typed by the user
 * @param {string} clubSlug - Lowercase club slug matching a file in
 *                            public/data/players/ (e.g. "liverpool")
 * @returns {Promise<
 *   { type: 'FOUND',          players: object[] } |
 *   { type: 'UNKNOWN_PLAYER'                    } |
 *   { type: 'ERROR',          message: string   }
 * >}
 */
async function resolvePlayer(rawName, clubSlug) {
  // 1. Normalise input
  const query = translate_input(rawName);
  if (!query) return { type: 'UNKNOWN_PLAYER' };

  if (!clubSlug) {
    return { type: 'ERROR', message: 'clubSlug is required to resolve a player from the static dataset.' };
  }

  // 2. Load the club's static dataset
  const loadResult = loadClubDataset(clubSlug);
  if (!loadResult.ok) {
    return { type: 'ERROR', message: loadResult.error };
  }

  const { dataset } = loadResult;
  const players = dataset.players || [];

  if (players.length === 0) {
    return { type: 'UNKNOWN_PLAYER' };
  }

  // 3. Build fuzzy-searchable pool (names + aliases all in one flat list)
  const pool = _buildSearchPool(players);

  // 4. Run Fuse.js fuzzy search against the pool
  // Threshold 0.40: permissive enough for partial/misspelled inputs but tight
  // enough to avoid false positives on completely unrelated names.
  const fuseResults = fuzzySearch(query, pool, {
    keys: ['searchName'],
    threshold: 0.40,
    includeScore: true,
  });

  if (fuseResults.length === 0) {
    // No match at all — return UNKNOWN_PLAYER (distinct from NOT_FOUND)
    return { type: 'UNKNOWN_PLAYER' };
  }

  // 5. Deduplicate: multiple aliases for the same player may all match.
  //    Collect unique canonical player records (preserve Fuse ordering by score).
  const seenNames = new Set();
  const uniquePlayers = [];
  for (const result of fuseResults) {
    const canonicalName = result.item.player.name;
    if (!seenNames.has(canonicalName)) {
      seenNames.add(canonicalName);
      uniquePlayers.push(result.item.player);
    }
  }

  // 6. Return result
  //    - Exactly 1 confident match → FOUND with single entry (caller will proceed to scraper)
  //    - Multiple plausible matches → FOUND with multiple entries (caller will disambiguate)
  return { type: 'FOUND', players: uniquePlayers };
}

module.exports = { translate_input, resolvePlayer };
