const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(path.join(__dirname, '../premier_league_clubs_players.md'), 'utf-8');
const lines = content.split(/\r?\n/);

let currentClub = null;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line || line.startsWith('# ')) {
    if (line.startsWith('# ')) currentClub = line.substring(2).trim();
    continue;
  }

  // Find all numbers in the line
  const numbers = line.match(/\d+/g);
  if (numbers && numbers.length > 1) {
    console.log(`[${currentClub}] Line ${i + 1}: ${line} --> Numbers found: ${numbers.join(', ')}`);
  }
}
