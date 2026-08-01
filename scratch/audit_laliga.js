const fs = require('fs');
const path = require('path');

const mdPath = path.join(__dirname, '../Laliga.md');
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
  const numMatch = rest.match(/(\d+)/);
  const goals = numMatch ? parseInt(numMatch[1], 10) : 0;
  return { name, goals, rest };
}

for (const [club, list] of Object.entries(clubs)) {
  const parsed = list.map(item => ({ lineNum: item.lineNum, raw: item.raw, ...parseLine(item.raw) }));
  
  // 1. Check byte-for-byte exact name duplicates
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
        exactDupsRemoved.push({ name, totalOccurrences: entries.length, removed: entries.length - 1 });
      }
    }
  }

  // 2. Check near-duplicates (accent/spelling variations) just for awareness
  const normalizedMap = new Map();
  for (const p of finalPlayers) {
    const norm = p.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (!normalizedMap.has(norm)) normalizedMap.set(norm, []);
    normalizedMap.get(norm).push(p);
  }
  const nearDups = [];
  for (const [norm, group] of normalizedMap.entries()) {
    if (group.length > 1) {
      nearDups.push(group.map(g => `"${g.name}" (${g.goals})`).join(' VS '));
    }
  }

  console.log(`=== ${club} ===`);
  console.log(`Total raw lines in file: ${list.length}`);
  console.log(`Final player count in JSON: ${finalPlayers.length}`);
  console.log(`Exact duplicates (same byte-for-byte name + goals) removed: ${exactDupsRemoved.reduce((a, c) => a + c.removed, 0)}`);
  if (exactDupsRemoved.length > 0) {
    exactDupsRemoved.forEach(d => console.log(`  - Exact Dup: "${d.name}" (${d.totalOccurrences} lines, ${d.removed} removed)`));
  }
  console.log(`Goal conflicts (same byte-for-byte name, different goals): ${conflicts.length}`);
  if (conflicts.length > 0) {
    conflicts.forEach(c => {
      console.log(`  - CONFLICT: "${c.name}"`);
      c.entries.forEach(e => console.log(`      Line ${e.lineNum}: ${e.goals} goals (raw: "${e.raw}")`));
    });
  }
  console.log(`Near-duplicate variants (kept separate per strict rules): ${nearDups.length}`);
  if (nearDups.length > 0) {
    nearDups.forEach(nd => console.log(`  - Variant pair: ${nd}`));
  }
  console.log('');
}
