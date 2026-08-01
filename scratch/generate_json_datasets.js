const fs = require('fs');
const path = require('path');

const mdPath = path.join(__dirname, '../premier_league_clubs_players.md');
const outputDir = path.join(__dirname, '../public/data/players');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const content = fs.readFileSync(mdPath, 'utf-8');
const lines = content.split(/\r?\n/);

let currentClub = null;
const clubsData = {};

for (let i = 0; i < lines.length; i++) {
  const rawLine = lines[i].trim();
  if (!rawLine) continue;

  if (rawLine.startsWith('# ')) {
    currentClub = rawLine.replace(/^#\s+/, '').trim();
    clubsData[currentClub] = [];
    continue;
  }

  if (!currentClub) continue;

  let clean = rawLine.replace(/^[-*\s]+/, '');

  let name = '';
  let rest = '';

  // Case 1: Bold name in markdown, e.g. **Aaron Wan-Bissaka:** 2 هدف
  if (clean.startsWith('**')) {
    const boldEnd = clean.indexOf('**', 2);
    if (boldEnd !== -1) {
      name = clean.substring(2, boldEnd).trim();
      rest = clean.substring(boldEnd + 2).trim();
      if (rest.startsWith(':')) {
        rest = rest.substring(1).trim();
      }
    }
  }

  // Case 2: Em-dash / En-dash / double dash separator, e.g. Abel Xavier — 0 هدف
  if (!name) {
    const dashMatch = clean.match(/^(.+?)\s*(?:—|–|---|--)\s*(.*)$/);
    if (dashMatch) {
      name = dashMatch[1].trim();
      rest = dashMatch[2].trim();
    }
  }

  // Case 3: Colon separator if no em-dash or bold syntax
  if (!name) {
    const colonMatch = clean.match(/^(.+?)\s*:\s*(.*)$/);
    if (colonMatch) {
      name = colonMatch[1].trim();
      rest = colonMatch[2].trim();
    } else {
      name = clean.trim();
      rest = '';
    }
  }

  name = name.replace(/\*\*/g, '').trim();

  let goals = 0;
  if (rest.includes('لم يلعب')) {
    goals = 0;
  } else {
    const numMatch = rest.match(/(\d+)/);
    if (numMatch) {
      goals = parseInt(numMatch[1], 10);
    } else {
      goals = 0;
    }
  }

  clubsData[currentClub].push({
    lineNum: i + 1,
    rawLine,
    name,
    goals,
    rest
  });
}

const reportSummary = [];

for (const [clubName, rawEntries] of Object.entries(clubsData)) {
  const clubSlug = clubName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const filePath = path.join(outputDir, `${clubSlug}.json`);

  // Exact duplicate detection & conflict detection per user prompt rules
  const nameMap = new Map();
  for (const entry of rawEntries) {
    if (!nameMap.has(entry.name)) {
      nameMap.set(entry.name, []);
    }
    nameMap.get(entry.name).push(entry);
  }

  const duplicatesRemoved = [];
  const conflicts = [];
  const finalPlayers = [];

  for (const [name, list] of nameMap.entries()) {
    const uniqueGoals = new Set(list.map(e => e.goals));
    if (uniqueGoals.size > 1) {
      // Same exact name with DIFFERENT numbers -> CONFLICT!
      conflicts.push({ name, list });
    } else {
      // Same goal number for all instances of exact name -> Keep ONE
      finalPlayers.push(list[0]);
      if (list.length > 1) {
        duplicatesRemoved.push({ name, countRemoved: list.length - 1, list });
      }
    }
  }

  const jsonPlayers = finalPlayers.map(p => ({
    name: p.name,
    aliases: [],
    goals_by_competition: {
      League: p.goals
    },
    total_goals: p.goals,
    source: "user-provided dataset (premier_league_clubs_players.md)",
    notes: "League-only entry; no Champions League or cup data provided in source."
  }));

  const jsonObject = {
    club: clubName,
    players: jsonPlayers
  };

  fs.writeFileSync(filePath, JSON.stringify(jsonObject, null, 2), 'utf-8');

  const totalDupsRemoved = duplicatesRemoved.reduce((acc, curr) => acc + curr.countRemoved, 0);

  reportSummary.push({
    clubName,
    clubSlug,
    totalRawLines: rawEntries.length,
    finalPlayerCount: jsonPlayers.length,
    exactDuplicatesRemoved: totalDupsRemoved,
    duplicatesRemovedList: duplicatesRemoved,
    conflicts
  });
}

console.log(JSON.stringify(reportSummary, null, 2));
