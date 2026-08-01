const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(path.join(__dirname, '../premier_league_clubs_players.md'), 'utf-8');
const lines = content.split(/\r?\n/);

let currentClub = null;
const clubMap = {};

for (let i = 0; i < lines.length; i++) {
  const rawLine = lines[i].trim();
  if (!rawLine) continue;

  if (rawLine.startsWith('# ')) {
    currentClub = rawLine.replace(/^#\s+/, '').trim();
    clubMap[currentClub] = [];
    continue;
  }

  if (!currentClub) continue;

  // Clean leading bullet dashes/spaces
  let clean = rawLine.replace(/^[-*\s]+/, '');

  let name = '';
  let rest = '';

  // Case 1: Bold name, e.g. **Aaron Wan-Bissaka:** 2 هدف
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

  // Case 2: Em-dash / En-dash / double-dash separator, e.g. Abel Xavier — 0 هدف
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

  clubMap[currentClub].push({
    lineNum: i + 1,
    rawLine,
    name,
    goals,
    rest
  });
}

for (const [club, entries] of Object.entries(clubMap)) {
  console.log(`\n========================================`);
  console.log(`Club: ${club} | Total Raw Lines: ${entries.length}`);

  // Group by exact name
  const nameMap = new Map();
  for (const entry of entries) {
    if (!nameMap.has(entry.name)) {
      nameMap.set(entry.name, []);
    }
    nameMap.get(entry.name).push(entry);
  }

  const duplicatesRemoved = []; // exact name + exact goal
  const conflicts = []; // exact name + different goals
  const finalPlayers = [];

  for (const [name, list] of nameMap.entries()) {
    const uniqueGoals = new Set(list.map(e => e.goals));
    if (uniqueGoals.size > 1) {
      // Same exact name, different goals -> CONFLICT!
      conflicts.push({ name, list });
    } else {
      // Same goal for all instances of this exact name
      // Keep ONE copy
      finalPlayers.push(list[0]);
      if (list.length > 1) {
        duplicatesRemoved.push({ name, countRemoved: list.length - 1, list });
      }
    }
  }

  console.log(`Final Players Count: ${finalPlayers.length}`);
  console.log(`Exact Duplicates Removed: ${duplicatesRemoved.reduce((acc, curr) => acc + curr.countRemoved, 0)}`);
  if (duplicatesRemoved.length > 0) {
    duplicatesRemoved.forEach(d => console.log(`  - Exact duplicate: "${d.name}" (${d.list.length} occurrences, kept 1)`));
  }
  console.log(`Conflicts Found: ${conflicts.length}`);
  if (conflicts.length > 0) {
    conflicts.forEach(c => {
      console.log(`  - CONFLICT for "${c.name}":`);
      c.list.forEach(item => console.log(`      Line ${item.lineNum}: goals=${item.goals} (raw: "${item.rawLine}")`));
    });
  }
}
