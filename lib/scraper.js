/**
 * lib/scraper.js
 *
 * Scrapes and parses player statistics tables from FBref profile pages.
 * Aggregates goals (or other categories) across all seasons for a specific club/league.
 *
 * Returns:
 *   { status: 'SUCCESS', value: number, rowsCount: number }  — when matching rows found
 *   { status: 'NOT_ASSOCIATED' }                              — zero rows match the given club
 *   { status: 'ERROR', message: string }                    — table structure mismatch or fetch error
 */

'use strict';

const axios = require('axios');
const cheerio = require('cheerio');

const FBREF_BASE = 'https://fbref.com';

// Standard headers for axios requests
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
};

/**
 * Helper to un-comment HTML comments in page content.
 * FBref embeds many tables inside HTML comments (<!-- <table ...> </table> -->)
 * to defer client rendering.
 *
 * @param {string} html
 * @returns {CheerioAPI} Cheerio object with commented tables unpacked
 */
function loadCheerioWithComments(html) {
  const $ = cheerio.load(html);

  // Search comments for tables and append unpacked HTML to body
  $.root()
    .find('*')
    .contents()
    .filter(function () {
      return this.type === 'comment' && this.data && this.data.includes('<table');
    })
    .each(function () {
      try {
        const commentHtml = this.data;
        $('body').append(commentHtml);
      } catch (e) {
        // ignore malformed comment chunks
      }
    });

  return $;
}

/**
 * Normalise strings for fuzzy/flexible matching (lowercase, strip accents/punctuation).
 *
 * @param {string} str
 * @returns {string}
 */
function normaliseString(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

/**
 * Parse player stats table from raw HTML.
 *
 * FBref Standard Stats Table structure:
 * - Table selector: `table.stats_table` or `table[id*="stats"]`
 * - Table rows: `tbody tr`
 * - Cells have `data-stat` attributes:
 *   - `season`
 *   - `team` or `squad`
 *   - `comp_level` or `league`
 *   - `goals` (outfield) or `gk_goals` / `goals` (keeper)
 *   - `assists`
 *
 * @param {string} html - Raw HTML of player profile page
 * @param {string} clubName - Name of club to filter by (e.g. "Liverpool", "Manchester City")
 * @param {string} [leagueName] - Name of league to filter by (optional)
 * @param {string} [category="goals"] - Stat category: "goals" | "assists"
 * @returns {{ status: 'SUCCESS'|'NOT_ASSOCIATED'|'ERROR', value?: number, rowsCount?: number, message?: string }}
 */
function parsePlayerStats(html, clubName, leagueName, category = 'goals') {
  if (!html || typeof html !== 'string') {
    return { status: 'ERROR', message: 'Invalid HTML content provided' };
  }

  if (!clubName) {
    return { status: 'ERROR', message: 'Club name is required for filtering' };
  }

  const $ = loadCheerioWithComments(html);

  // Target standard stats tables or keeper stats tables
  const $tables = $('table.stats_table, table[id*="stats_standard"], table[id*="stats_keeper"]');

  if ($tables.length === 0) {
    // Check if zero stats message exists or if page structure is unrecognized
    if ($('#meta').length > 0) {
      // Valid player page but no stats tables found -> player never played in target competitions
      return { status: 'NOT_ASSOCIATED' };
    }
    return { status: 'ERROR', message: 'No valid stats table found on player profile' };
  }

  const normClub = normaliseString(clubName);
  const normLeague = leagueName ? normaliseString(leagueName) : null;

  const parsedRows = [];
  let foundAnyClubMatch = false;

  $tables.each((_, table) => {
    const $tbody = $(table).find('tbody');
    if ($tbody.length === 0) return;

    $tbody.find('tr').each((_, tr) => {
      const $tr = $(tr);
      // Skip row header dividers or summary rows
      if ($tr.hasClass('thead') || $tr.hasClass('sub_head')) return;

      // Extract cells by data-stat attribute or cell index
      const squadCell = $tr.find('td[data-stat="team"], td[data-stat="squad"], td[data-stat="team_name"]');
      const compCell  = $tr.find('td[data-stat="comp_level"], td[data-stat="league"], td[data-stat="comp_name"]');

      const squadText = squadCell.text().trim();
      const compText  = compCell.text().trim();

      if (!squadText) return;

      const normRowSquad  = normaliseString(squadText);
      const normRowLeague = normaliseString(compText);

      // Check if squad matches target club
      const isClubMatch = normRowSquad.includes(normClub) || normClub.includes(normRowSquad);

      if (isClubMatch) {
        foundAnyClubMatch = true;

        // Check if league filter is specified and matches
        let isLeagueMatch = true;
        if (normLeague) {
          isLeagueMatch = normRowLeague.includes(normLeague) || normLeague.includes(normRowLeague);
        }

        if (isLeagueMatch) {
          // Extract requested stat category value
          let statValue = 0;
          let cellAttr = category === 'assists' ? 'assists' : 'goals';

          const statCell = $tr.find(`td[data-stat="${cellAttr}"], td[data-stat="gk_${cellAttr}"]`);
          if (statCell.length > 0) {
            const rawVal = statCell.text().trim();
            const parsed = parseInt(rawVal, 10);
            if (!isNaN(parsed)) {
              statValue = parsed;
            }
          }

          parsedRows.push({
            squad: squadText,
            league: compText,
            value: statValue
          });
        }
      }
    });
  });

  // Requirement: If club-filtered result set is empty -> return NOT_ASSOCIATED
  if (!foundAnyClubMatch || parsedRows.length === 0) {
    return { status: 'NOT_ASSOCIATED' };
  }

  // Requirement: Sum stat values across ALL matching season rows
  const aggregatedTotal = parsedRows.reduce((sum, row) => sum + row.value, 0);

  return {
    status: 'SUCCESS',
    value: aggregatedTotal,
    rowsCount: parsedRows.length
  };
}

/**
 * Fetch and parse player stats for a specific profile URL, club, and league.
 *
 * @param {string} profileUrlOrId - Absolute FBref profile URL or player ID
 * @param {string} clubName - Target club name (e.g. "Liverpool")
 * @param {string} [leagueName] - Target league name (e.g. "Premier League")
 * @param {string} [category="goals"] - "goals" | "assists"
 * @returns {Promise<{ status: 'SUCCESS'|'NOT_ASSOCIATED'|'ERROR', value?: number, rowsCount?: number, message?: string }>}
 */
async function fetchPlayerStats(profileUrlOrId, clubName, leagueName, category = 'goals') {
  if (!profileUrlOrId) {
    return { status: 'ERROR', message: 'Profile URL or Player ID is required' };
  }

  // Build absolute profile URL if relative or ID given
  let targetUrl = profileUrlOrId;
  if (!targetUrl.startsWith('http')) {
    targetUrl = `${FBREF_BASE}/en/players/${profileUrlOrId}`;
  }

  try {
    const response = await axios.get(targetUrl, {
      headers: BROWSER_HEADERS,
      timeout: 15000,
      maxRedirects: 5,
    });

    return parsePlayerStats(response.data, clubName, leagueName, category);

  } catch (err) {
    if (err.response && err.response.status === 404) {
      return { status: 'NOT_ASSOCIATED' };
    }
    const status = err.response ? err.response.status : undefined;
    if (status === 403) {
      return {
        status: 'ERROR',
        message: 'FBref access restricted (403). Cloudflare bot shield active.'
      };
    }
    return {
      status: 'ERROR',
      message: `Failed to fetch player stats: ${err.message}`
    };
  }
}

module.exports = {
  fetchPlayerStats,
  parsePlayerStats,
  loadCheerioWithComments
};
