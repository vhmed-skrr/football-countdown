const fs = require('fs');
const path = require('path');

const mdPath = path.join(__dirname, '../Laliga.md');
const outputDir = path.join(__dirname, '../public/data/players');

const content = fs.readFileSync(mdPath, 'utf-8');
const lines = content.split(/\r?\n/);

let currentClub = null;
const clubsData = {};

for (let i = 0; i < lines.length; i++) {
  const rawLine = lines[i];
  const trimmed = rawLine.trim();

  // Detect club headings: lines starting with one or more # followed by a club name
  if (/^#+\s+/.test(trimmed)) {
    const clubName = trimmed.replace(/^#+\s+/, '').trim();
    if (clubName) {
      currentClub = clubName;
      if (!clubsData[currentClub]) {
        clubsData[currentClub] = [];
      }
    }
    continue;
  }

  if (!currentClub || !trimmed) continue;

  clubsData[currentClub].push({ lineNum: i + 1, rawLine: trimmed });
}

console.log('Clubs found:', Object.keys(clubsData));
for (const [club, lines] of Object.entries(clubsData)) {
  console.log(`  ${club}: ${lines.length} raw lines`);
}
