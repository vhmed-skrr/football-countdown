const fs = require('fs');
const path = require('path');

const fileContent = fs.readFileSync(path.join(__dirname, '../premier_league_clubs_players.md'), 'utf-8');

const lines = fileContent.split(/\r?\n/);

let currentClub = null;
const clubData = {};

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;

  if (line.startsWith('# ')) {
    currentClub = line.replace(/^#\s+/, '').trim();
    clubData[currentClub] = [];
    continue;
  }

  if (currentClub) {
    clubData[currentClub].push({ lineNum: i + 1, raw: line });
  }
}

console.log("Clubs found:", Object.keys(clubData));
for (const club of Object.keys(clubData)) {
  console.log(`${club}: ${clubData[club].length} lines`);
}
