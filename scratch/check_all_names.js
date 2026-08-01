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

  let clean = rawLine.replace(/^[-*\s]+/, '');

  let name = '';
  let rest = '';

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

  if (!name) {
    const dashMatch = clean.match(/^(.+?)\s*(?:—|–|---|--)\s*(.*)$/);
    if (dashMatch) {
      name = dashMatch[1].trim();
      rest = dashMatch[2].trim();
    }
  }

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
  const seenNames = new Map();
  for (const entry of entries) {
    if (!seenNames.has(entry.name)) {
      seenNames.set(entry.name, []);
    }
    seenNames.get(entry.name).push(entry);
  }

  let dupCount = 0;
  let conflictCount = 0;
  for (const [name, list] of seenNames.entries()) {
    if (list.length > 1) {
      const goalsSet = new Set(list.map(e => e.goals));
      if (goalsSet.size === 1) {
        console.log(`[EXACT DUP] Club "${club}" has ${list.length} exact entries for "${name}" with ${list[0].goals} goals:`);
        list.forEach(l => console.log(`  Line ${l.lineNum}: ${l.rawLine}`));
        dupCount++;
      } else {
        console.log(`[CONFLICT] Club "${club}" has conflicting goals for "${name}":`);
        list.forEach(l => console.log(`  Line ${l.lineNum}: ${l.goals} goals (raw: "${l.rawLine}")`));
        conflictCount++;
      }
    }
  }
  if (dupCount === 0 && conflictCount === 0) {
    console.log(`Club "${club}": 0 exact duplicates, 0 conflicts. Unique names: ${seenNames.size}/${entries.length}`);
  }
}
