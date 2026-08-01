const fs = require('fs');
const path = require('path');

const mdPath = path.join(__dirname, '../Bundesliga.md');
const outputDir = path.join(__dirname, '../public/data/players');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const content = fs.readFileSync(mdPath, 'utf-8');
const lines = content.split(/\r?\n/);

let currentClub = null;
const clubsData = {};

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;

  if (/^#+/.test(line)) {
    currentClub = line.replace(/^[#\s]+/, '').trim();
    if (!clubsData[currentClub]) {
      clubsData[currentClub] = [];
    }
    continue;
  }

  if (currentClub) {
    clubsData[currentClub].push({ lineNum: i + 1, raw: line });
  }
}

function parseLine(raw) {
  let clean = raw.replace(/\s+$/, '');
  let name = '';
  let rest = '';

  const emDashMatch = clean.match(/^(.+?)\s*(?:—|–)\s*(.*)$/);
  if (emDashMatch) {
    name = emDashMatch[1].trim();
    rest = emDashMatch[2].trim();
  } else {
    const colonMatch = clean.match(/^(.+?):\s*(.*)$/);
    if (colonMatch) {
      name = colonMatch[1].trim();
      rest = colonMatch[2].trim();
    } else {
      name = clean.trim();
      rest = '';
    }
  }

  const numMatch = rest.match(/(\d+)/);
  const goals = numMatch ? parseInt(numMatch[1], 10) : 0;

  return { name, goals, rest };
}

function getSlug(clubName) {
  return clubName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const summary = [];

for (const [clubName, rawEntries] of Object.entries(clubsData)) {
  const slug = getSlug(clubName);
  const filePath = path.join(outputDir, `${slug}.json`);

  const parsed = rawEntries.map(e => ({
    lineNum: e.lineNum,
    raw: e.raw,
    ...parseLine(e.raw)
  }));

  // Group by exact byte-for-byte name
  const nameMap = new Map();
  for (const entry of parsed) {
    if (!nameMap.has(entry.name)) {
      nameMap.set(entry.name, []);
    }
    nameMap.get(entry.name).push(entry);
  }

  const exactDupsRemoved = [];
  const conflicts = [];
  const finalPlayers = [];

  for (const [name, entries] of nameMap.entries()) {
    const uniqueGoals = new Set(entries.map(e => e.goals));
    if (uniqueGoals.size > 1) {
      conflicts.push({ name, entries });
    } else {
      finalPlayers.push(entries[0]);
      if (entries.length > 1) {
        exactDupsRemoved.push({
          name,
          totalOccurrences: entries.length,
          removed: entries.length - 1
        });
      }
    }
  }

  const jsonPlayers = finalPlayers.map(p => ({
    name: p.name,
    aliases: [],
    goals_by_competition: {
      "Bundesliga": p.goals
    },
    total_goals: p.goals,
    source: "user-provided dataset (Bundesliga.md)",
    notes: "Bundesliga-only entry; no Champions League or cup data provided in source."
  }));

  const jsonObject = {
    club: clubName,
    players: jsonPlayers
  };

  fs.writeFileSync(filePath, JSON.stringify(jsonObject, null, 2), 'utf-8');

  const totalDupsRemoved = exactDupsRemoved.reduce((acc, curr) => acc + curr.removed, 0);

  summary.push({
    clubName,
    slug,
    filePath,
    rawLinesCount: rawEntries.length,
    finalPlayerCount: jsonPlayers.length,
    exactDuplicatesRemoved: totalDupsRemoved,
    exactDupsRemovedDetails: exactDupsRemoved,
    conflicts,
    zeroGoalCount: jsonPlayers.filter(p => p.total_goals === 0).length,
    oneGoalCount: jsonPlayers.filter(p => p.total_goals === 1).length
  });
}

console.log('=== BUNDESLIGA BUILD COMPLETE ===');
console.log(JSON.stringify(summary, null, 2));
