/**
 * lib/playerDataStore.js
 *
 * Loads and provides access to static per-club player datasets stored as JSON
 * files in public/data/players/<clubSlug>.json.
 *
 * This module completely replaces any live HTTP fetching from FBref.
 * All player data — including goals broken down by competition — is read
 * from pre-built static files at request time.
 *
 * --- File shape for public/data/players/<club-slug>.json ---
 * {
 *   "club": "Liverpool",
 *   "players": [
 *     {
 *       "name": "Mohamed Salah",
 *       "aliases": ["Mo Salah", "Salah"],   // for fuzzy / alt-name matching
 *       "goals_by_competition": {
 *         "Premier League": 186,
 *         "Champions League": 33,
 *         "FA Cup": 15,
 *         "EFL Cup": 8
 *       },
 *       "total_goals": 242
 *     },
 *     ...
 *   ]
 * }
 *
 * --- Vercel / Serverless path resolution note ---
 * Vercel packages each serverless function's working directory at build time.
 * Files inside the `public/` directory are included in the deployment bundle
 * because Vercel treats `public/` as the static output directory and also
 * makes it available to serverless functions as part of the project root.
 *
 * Inside a Vercel function invocation the process working directory is the
 * project root (i.e. the directory that contains package.json).  Therefore
 * the correct path to the players/ data files is:
 *
 *   path.join(process.cwd(), 'public', 'data', 'players', `${slug}.json`)
 *
 * This is tested explicitly — DO NOT switch to __dirname-relative paths,
 * because __dirname inside a bundled/transpiled Vercel function resolves to
 * the internal build cache, not the project root.
 *
 * --- Caching strategy ---
 * We cache parsed datasets in a module-level Map for the lifetime of a single
 * serverless function invocation.  Serverless functions get a fresh process
 * per cold-start, so the cache never persists across requests.  This is
 * intentional and consistent with the project's no-persistent-caching
 * architecture (documented in ARCHITECTURE.md).
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// In-invocation cache — cleared on every cold-start (new process)
// ---------------------------------------------------------------------------
const _cache = new Map();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the absolute filesystem path to a club's JSON data file.
 *
 * Uses process.cwd() — the project root — which is the correct anchor point
 * inside a Vercel serverless function invocation.
 *
 * @param {string} clubSlug - e.g. "liverpool", "barcelona"
 * @returns {string} Absolute path
 */
function _resolveDataPath(clubSlug) {
  return path.join(process.cwd(), 'public', 'data', 'players', `${clubSlug}.json`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load and return the player dataset for a given club slug.
 *
 * Reads from public/data/players/<clubSlug>.json.  Parsed result is cached
 * in-memory for the duration of the current serverless function invocation
 * so that repeated calls within the same request do not re-read the file.
 *
 * Returns a distinct result object — never throws — so callers can handle
 * the "dataset not yet collected" case gracefully.
 *
 * @param {string} clubSlug - Lowercase, hyphenated club identifier (e.g. "liverpool")
 * @returns {{ ok: true, dataset: object } | { ok: false, error: string }}
 */
function loadClubDataset(clubSlug) {
  if (!clubSlug || typeof clubSlug !== 'string') {
    return { ok: false, error: 'clubSlug must be a non-empty string' };
  }

  const slug = clubSlug.trim().toLowerCase();

  // Return cached result if already loaded this invocation
  if (_cache.has(slug)) {
    return { ok: true, dataset: _cache.get(slug) };
  }

  const filePath = _resolveDataPath(slug);

  if (!fs.existsSync(filePath)) {
    return {
      ok: false,
      error: `No dataset found for club "${slug}". ` +
             `Expected file: public/data/players/${slug}.json — ` +
             `add this file to the project before this club can be used in gameplay. ` +
             `(Adding a new club requires only a new JSON data file — no code changes needed.)`
    };
  }

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (ioErr) {
    return {
      ok: false,
      error: `Failed to read player data file for "${slug}": ${ioErr.message}`
    };
  }

  let dataset;
  try {
    dataset = JSON.parse(raw);
  } catch (parseErr) {
    return {
      ok: false,
      error: `Failed to parse player data JSON for "${slug}": ${parseErr.message}`
    };
  }

  if (!dataset || !Array.isArray(dataset.players)) {
    return {
      ok: false,
      error: `Invalid dataset structure for "${slug}": missing "players" array.`
    };
  }

  // Cache for this invocation
  _cache.set(slug, dataset);

  return { ok: true, dataset };
}

/**
 * Clear the in-invocation cache.
 * Primarily useful for isolated unit tests that load multiple datasets in sequence.
 */
function clearCache() {
  _cache.clear();
}

module.exports = { loadClubDataset, clearCache };
