/**
 * lib/fuzzyMatch.js
 *
 * Fuse.js-based fuzzy string comparison utilities.
 * Used by playerResolver.js to re-rank/filter candidate results returned by
 * FBref's search against the user's input, and to detect near-duplicate
 * names in the disambiguation list.
 *
 * Fuse.js 7.x provides a CJS bundle at `./dist/fuse.cjs` which is registered
 * as the package `main` field, so `require('fuse.js')` works directly in CommonJS.
 */

'use strict';

const Fuse = require('fuse.js');

// Default Fuse options tuned for football player name matching
const DEFAULT_OPTIONS = {
  includeScore: true,
  threshold: 0.40,
  distance: 200,
  minMatchCharLength: 2,
  useExtendedSearch: false,
  keys: ['name'],
};

/**
 * Run a fuzzy search for a query string against an array of candidate objects.
 *
 * @param {string} query - Search string
 * @param {Array<object>} candidates - Array of objects to search
 * @param {object} [optionOverrides] - Optional Fuse.js options overrides
 * @returns {Array<{item: object, score: number, refIndex: number}>}
 */
function fuzzySearch(query, candidates, optionOverrides = {}) {
  if (!query || !candidates || candidates.length === 0) return [];

  const options = { ...DEFAULT_OPTIONS, ...optionOverrides };
  const fuse = new Fuse(candidates, options);

  return fuse.search(query);
}

/**
 * Simple "best single match" helper.
 *
 * @param {string} query
 * @param {Array<object>} candidates
 * @param {object} [optionOverrides]
 * @returns {object|null}
 */
function bestMatch(query, candidates, optionOverrides = {}) {
  const results = fuzzySearch(query, candidates, optionOverrides);
  return results.length > 0 ? results[0].item : null;
}

/**
 * Check whether two name strings are fuzzy-equivalent.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function isFuzzyMatch(a, b) {
  const results = fuzzySearch(a, [{ name: b }]);
  return results.length > 0;
}

module.exports = { fuzzySearch, bestMatch, isFuzzyMatch };
