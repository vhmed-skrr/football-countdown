const fs = require('fs');
const path = require('path');

const mdPath = path.join(__dirname, '../Laliga.md');
const outputDir = path.join(__dirname, '../public/data/players');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const content = fs.readFileSync(mdPath, 'utf-8');
const lines = content.split(/\r?\n/);

let currentClub = null;
const clubsData = {};

for (let i = 0; i < lines.length; i++) {
  const trimmed = lines[i].trim();

  // Detect club headings: one or more # at the start
  if (/^#+\s*/.test(trimmed) && trimmed.replace(/^#+\s*/, '').trim()) {
    const clubName = trimmed.replace(/^#+\s*/, '').trim();
    currentClub = clubName;
    if (!clubsData[currentClub]) {
      clubsData[currentClub] = [];
    }
    continue;
  }

  if (!currentClub || !trimmed) continue;

  clubsData[currentClub].push({ lineNum: i + 1, rawLine: trimmed });
}

function parseLine(rawLine) {
  // Strip trailing markdown whitespace (double space or trailing spaces)
  let clean = rawLine.replace(/\s+$/, '');

  let name = '';
  let rest = '';

  // Pattern 1: Em-dash or en-dash separator:  Name — Goals
  const emDashMatch = clean.match(/^(.+?)\s*(?:—|–)\s*(.*)$/);
  if (emDashMatch) {
    name = emDashMatch[1].trim();
    rest = emDashMatch[2].trim();
  } else {
    // Pattern 2: Colon separator (Real Betis format):  Name: Goals
    const colonMatch = clean.match(/^(.+?):\s*(.*)$/);
    if (colonMatch) {
      name = colonMatch[1].trim();
      rest = colonMatch[2].trim();
    } else {
      name = clean.trim();
      rest = '';
    }
  }

  // Extract goal number: first integer in the rest string
  const numMatch = rest.match(/(\d+)/);
  const goals = numMatch ? parseInt(numMatch[1], 10) : 0;

  return { name, goals, rest };
}

const reportSummary = [];

// Map club names to canonical display names and slugs
const clubMeta = {
  '# Real Madrid': { displayName: 'Real Madrid', slug: 'real-madrid' },
  'Barcelona':     { displayName: 'Barcelona',   slug: 'barcelona' },
  'Atletico Madrid': { displayName: 'Atletico Madrid', slug: 'atletico-madrid' },
  'Seville':       { displayName: 'Seville',     slug: 'seville' },
  'Real Betis':    { displayName: 'Real Betis',  slug: 'real-betis' },
};

for (const [rawClubKey, rawEntries] of Object.entries(clubsData)) {
  const meta = clubMeta[rawClubKey] || {
    displayName: rawClubKey,
    slug: rawClubKey.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  };

  const { displayName, slug } = meta;
  const filePath = path.join(outputDir, `${slug}.json`);

  // Parse all lines
  const parsed = rawEntries.map(e => {
    const p = parseLine(e.rawLine);
    return { lineNum: e.lineNum, rawLine: e.rawLine, name: p.name, goals: p.goals };
  });

  // Group by exact name for deduplication
  const nameMap = new Map();
  for (const entry of parsed) {
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
      // Same exact name, different numbers -> CONFLICT, exclude from output
      conflicts.push({ name, list });
    } else {
      // Same or single entry -> keep ONE copy
      finalPlayers.push(list[0]);
      if (list.length > 1) {
        duplicatesRemoved.push({ name, count: list.length, kept: 1, removed: list.length - 1 });
      }
    }
  }

  const jsonPlayers = finalPlayers.map(p => ({
    name: p.name,
    aliases: [],
    goals_by_competition: {
      "La Liga": p.goals
    },
    total_goals: p.goals,
    source: "user-provided dataset (Laliga.md)",
    notes: "La Liga-only entry; no Champions League or cup data provided in source."
  }));

  const jsonObject = {
    club: displayName,
    players: jsonPlayers
  };

  fs.writeFileSync(filePath, JSON.stringify(jsonObject, null, 2), 'utf-8');

  const totalDupsRemoved = duplicatesRemoved.reduce((acc, curr) => acc + curr.removed, 0);

  reportSummary.push({
    rawClubKey,
    displayName,
    slug,
    totalRawLines: rawEntries.length,
    finalPlayerCount: finalPlayers.length,
    exactDuplicatesRemoved: totalDupsRemoved,
    duplicatesRemovedList: duplicatesRemoved,
    conflicts
  });
}

// Print summary
for (const r of reportSummary) {
  console.log(`\n==============================`);
  console.log(`Club: ${r.displayName} (slug: ${r.slug})`);
  console.log(`  Raw lines: ${r.totalRawLines}`);
  console.log(`  Final player count: ${r.finalPlayerCount}`);
  console.log(`  Exact duplicates removed: ${r.exactDuplicatesRemoved}`);
  if (r.duplicatesRemovedList.length > 0) {
    r.duplicatesRemovedList.forEach(d => console.log(`    - "${d.name}": ${d.count} occurrences, kept 1, removed ${d.removed}`));
  }
  console.log(`  Conflicts (same name, different goals): ${r.conflicts.length}`);
  if (r.conflicts.length > 0) {
    r.conflicts.forEach(c => {
      console.log(`    CONFLICT: "${c.name}"`);
      c.list.forEach(item => console.log(`      Line ${item.lineNum}: goals=${item.goals} (raw: "${item.rawLine}")`));
    });
  }
}

console.log('\n\nAll files written successfully.');
