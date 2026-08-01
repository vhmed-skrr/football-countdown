const fs = require('fs');
const path = require('path');

const mdPath = path.join(__dirname, '../Bundesliga.md');
const content = fs.readFileSync(mdPath, 'utf-8');
const lines = content.split(/\r?\n/);

let currentClub = null;
const clubs = {};

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  if (/^#+/.test(line)) {
    currentClub = line.replace(/^[#\s]+/, '').trim();
    clubs[currentClub] = [];
    continue;
  }
  if (currentClub) {
    clubs[currentClub].push({ lineNum: i + 1, raw: line });
  }
}

function parseLine(raw) {
  let clean = raw.replace(/\s+$/, '');
  let name = '', rest = '';

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

  // Find the first integer in rest
  const numMatch = rest.match(/(\d+)/);
  const goals = numMatch ? parseInt(numMatch[1], 10) : 0;

  return { name, goals, rest };
}

for (const [club, list] of Object.entries(clubs)) {
  const parsed = list.map(item => ({
    lineNum: item.lineNum,
    raw: item.raw,
    ...parseLine(item.raw)
  }));

  // 1. Group by byte-for-byte exact name
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

  console.log(`=== ${club} ===`);
  console.log(`Total raw lines in file: ${list.length}`);
  console.log(`Final player count in JSON: ${finalPlayers.length}`);
  console.log(`Exact duplicates removed: ${exactDupsRemoved.reduce((a, c) => a + c.removed, 0)}`);
  if (exactDupsRemoved.length > 0) {
    exactDupsRemoved.forEach(d => console.log(`  - Exact Dup: "${d.name}" (${d.totalOccurrences} lines, ${d.removed} removed)`));
  }
  console.log(`Goal conflicts (same name, different goals): ${conflicts.length}`);
  if (conflicts.length > 0) {
    conflicts.forEach(c => {
      console.log(`  - CONFLICT: "${c.name}"`);
      c.entries.forEach(e => console.log(`      Line ${e.lineNum}: ${e.goals} goals (raw: "${e.raw}")`));
    });
  }
  console.log(`Zero-goal count: ${finalPlayers.filter(p => p.goals === 0).length}`);
  console.log(`One-goal count: ${finalPlayers.filter(p => p.goals === 1).length}`);
  console.log('');
}
