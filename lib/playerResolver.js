/**
 * lib/playerResolver.js
 *
 * Resolves a raw player name string (possibly partial or misspelled) to one
 * or more real FBref player profiles using axios and cheerio.
 *
 * This module does NOT filter by club or league — that happens in A2 (scraper).
 * It only answers: "Does this person exist on FBref, and which profile(s) match?"
 *
 * Result types returned by resolvePlayer():
 *   { type: 'FOUND',     players: [PlayerCandidate, ...] }  — 1+ matches found
 *   { type: 'NOT_FOUND'                                   }  — no matches found / does not exist
 *   { type: 'ERROR',     message: string                 }  — network / parse / HTTP error
 *
 * PlayerCandidate shape:
 *   {
 *     name:       string,        // Full display name from FBref
 *     profileUrl: string,        // Absolute FBref profile URL
 *     photoUrl:   string|null,   // Headshot URL if found, otherwise null
 *     meta:       string|null    // Position · Country · DOB string if available
 *   }
 */

'use strict';

const axios = require('axios');
const cheerio = require('cheerio');
const { fuzzySearch } = require('./fuzzyMatch');

// ─────────────────────────────────────────────────────────────
// Constants & Config
// ─────────────────────────────────────────────────────────────
const FBREF_BASE = 'https://fbref.com';
const SEARCH_URL = `${FBREF_BASE}/search/search.fcgi`;

/**
 * Standard browser headers to send with axios requests to minimize bot detection.
 */
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1'
};

// ─────────────────────────────────────────────────────────────
// translate_input — normalisation stub (required from A0)
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
// Page parsers
// ─────────────────────────────────────────────────────────────

/**
 * Parse a search-results list page (multiple candidates).
 *
 * RISK AREA (iii) — Parsing FBref's actual search-results page structure.
 *
 * FBref search results page layout:
 *   #searches
 *     #players.search-item-category
 *       h2 "Players"
 *       .search-item  (one per player)
 *         .search-item-img > img[src]   (headshot, optional)
 *         .search-item-name > a[href]   (name text + relative profile URL)
 *         .search-item-url              (position · country · DOB, optional)
 *
 * RISK AREA (ii) — Case-insensitive matching.
 *
 * FBref search is case-insensitive on the server. When parsing candidates,
 * we retain verbatim names for URLs and display, but perform case-insensitive
 * fuzzy re-ranking using lowercased queries.
 *
 * @param {import('cheerio').CheerioAPI} $ - Loaded cheerio instance
 * @param {string} query - Original search query
 * @returns {Array<object>}
 */
function _parseSearchResultsPage($, query) {
  const candidates = [];

  // RISK AREA (iii) — Target #players inside #searches to avoid mixing in
  // teams, competitions, or manager results. Fall back to all .search-item inside #searches.
  const $playerSection = $('#searches #players');
  const $items = $playerSection.length
    ? $playerSection.find('.search-item')
    : $('#searches .search-item');

  $items.each((_, el) => {
    const $el = $(el);
    const $link = $el.find('.search-item-name a').first();
    const name = $link.text().trim();
    const href = $link.attr('href') || '';

    if (!name || !href) return; // skip malformed items

    // Ensure absolute profile URL
    const profileUrl = href.startsWith('http') ? href : `${FBREF_BASE}${href}`;

    // Extract photo URL if present
    const photoSrc = $el.find('.search-item-img img').attr('src') || null;

    // Extract metadata string (position, country, DOB)
    const meta = $el.find('.search-item-url').text().replace(/\s+/g, ' ').trim() || null;

    candidates.push({ name, profileUrl, photoUrl: photoSrc, meta });
  });

  return candidates;
}

/**
 * Parse a direct player profile page (single-match redirect result).
 *
 * RISK AREA (iii) — When FBref finds exactly 1 match, it redirects directly
 * to `/en/players/{id}/{slug}`. The DOM structure of a player page is:
 *   #meta
 *     .media-item.phead > img[src]   (headshot)
 *     h1[itemprop="name"] > span     (canonical player name)
 *     p                              (position, club, nationality, DOB)
 *
 * RISK AREA (iv) — Does not assume a single fixed selector; verifies HTML elements before extracting.
 *
 * @param {import('cheerio').CheerioAPI} $ - Loaded cheerio instance
 * @param {string} profileUrl - The final redirected profile URL
 * @returns {Array<object>} Always 1 candidate on success, [] on parse failure.
 */
function _parsePlayerProfilePage($, profileUrl) {
  // RISK AREA (iv) — Verify and extract name from known profile title selectors
  let name =
    $('h1[itemprop="name"] span').first().text().trim() ||
    $('h1 span[itemprop="name"]').first().text().trim() ||
    $('h1').first().text().trim();

  if (!name) return [];

  // Extract headshot photo URL from #meta if available
  const photoUrl =
    $('#meta .media-item.phead img').attr('src') ||
    $('#meta .phead img').attr('src') ||
    $('#meta img').first().attr('src') ||
    null;

  // Extract summary metadata from paragraphs inside #meta
  const metaParts = [];
  $('#meta p').each((_, p) => {
    const text = $(p).text().replace(/\s+/g, ' ').trim();
    if (text) metaParts.push(text);
  });
  const meta = metaParts.slice(0, 3).join(' · ') || null;

  return [{ name, profileUrl, photoUrl, meta }];
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Resolve a raw player name to one or more FBref player profiles using Axios and Cheerio.
 *
 * @param {string} rawName - Player name as typed by the user
 * @returns {Promise<{type:'FOUND', players: Array<object>} | {type:'NOT_FOUND'} | {type:'ERROR', message: string}>}
 */
async function resolvePlayer(rawName) {
  // 1. Normalise input
  const query = translate_input(rawName);
  if (!query) return { type: 'NOT_FOUND' };

  // ─── RISK AREA (i) — URL-encoding search string ───────────────────────────
  // Using URLSearchParams ensures proper percent-encoding of accented characters
  // (e.g., "Ödegaard"), apostrophes ("O'Brien"), and spaces ("Mo Salah" -> "Mo+Salah").
  // This avoids breakage from manual string concatenation or improper encodeURI calls.
  // ─────────────────────────────────────────────────────────────────────────
  const params = new URLSearchParams({ search: query });
  const searchUrl = `${SEARCH_URL}?${params.toString()}`;

  let response;
  try {
    // ─── RISK AREA (iii) — Axios request with redirect tracking ───────────────
    // Axios is configured with browser-like headers and maxRedirects: 5 so that
    // when FBref 302-redirects a single-match search directly to a player's profile,
    // axios follows the redirect automatically.
    // ─────────────────────────────────────────────────────────────────────────
    response = await axios.get(searchUrl, {
      headers: BROWSER_HEADERS,
      maxRedirects: 5,
      timeout: 15000,
    });
  } catch (err) {
    if (err.response && err.response.status === 404) {
      return { type: 'NOT_FOUND' };
    }
    const status = err.response ? err.response.status : undefined;
    if (status === 403) {
      return {
        type: 'ERROR',
        message: 'Access denied by FBref (403). Cloudflare bot protection active.'
      };
    }
    return {
      type: 'ERROR',
      message: `Network error fetching FBref (${err.message})`
    };
  }

  // ─── RISK AREA (iii) & (iv) — Page structure verification & redirect detection ─
  // Inspect the final response URL and the parsed HTML DOM structure with Cheerio.
  // We check whether we arrived at a single player profile page or a search list.
  // ─────────────────────────────────────────────────────────────────────────
  const html = response.data;
  const $ = cheerio.load(html);

  // Determine final URL after redirects (axios stores this in response.request.res.responseUrl or config)
  const finalUrl = response.request?.res?.responseUrl || response.config?.url || searchUrl;
  const isPlayerPageUrl = finalUrl.includes('/players/');

  const hasMeta = $('#meta').length > 0;
  const hasSearches = $('#searches').length > 0;

  let rawCandidates = [];

  if (isPlayerPageUrl || hasMeta) {
    // Direct single-match redirect: parse player profile page
    rawCandidates = _parsePlayerProfilePage($, finalUrl);
  } else if (hasSearches) {
    // Search list page: parse candidate list
    rawCandidates = _parseSearchResultsPage($, query);
  } else {
    // Check if zero results message is displayed in HTML
    const pageText = $('body').text().toLowerCase();
    if (pageText.includes('no results found') || pageText.includes('0 results')) {
      return { type: 'NOT_FOUND' };
    }
    // RISK AREA (iv): If neither known container is found, return explicit error
    return {
      type: 'ERROR',
      message: `Unexpected FBref HTML structure at ${finalUrl}`
    };
  }

  // ─── RISK AREA (d) — Handle zero candidates ──────────────────────────────
  if (!rawCandidates || rawCandidates.length === 0) {
    return { type: 'NOT_FOUND' };
  }

  // ─── RISK AREA (ii) — Case-insensitive fuzzy re-ranking ──────────────────
  // Lowercase the query and candidate names to perform case-insensitive
  // re-ranking with Fuse.js without mutating the original returned names/URLs.
  // ─────────────────────────────────────────────────────────────────────────
  const scoringPool = rawCandidates.map((c) => ({
    ...c,
    _lcName: c.name.toLowerCase(),
  }));

  const fuzzyResults = fuzzySearch(
    query.toLowerCase(),
    scoringPool,
    { keys: ['_lcName'], threshold: 0.55 }
  );

  let sortedCandidates;
  if (fuzzyResults.length > 0) {
    sortedCandidates = fuzzyResults.map((r) => {
      const { _lcName, ...clean } = r.item;
      return clean;
    });
  } else {
    sortedCandidates = rawCandidates;
  }

  return { type: 'FOUND', players: sortedCandidates };
}

/** Helper sleep function */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { translate_input, resolvePlayer, sleep };
