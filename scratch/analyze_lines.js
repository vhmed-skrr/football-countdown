const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(path.join(__dirname, '../premier_league_clubs_players.md'), 'utf-8');
const lines = content.split(/\r?\n/);

let currentClub = null;
const clubs = {};

for (let i = 0; i < lines.length; i++) {
  const rawLine = lines[i].trim();
  if (!rawLine) continue;

  if (rawLine.startsWith('# ')) {
    currentClub = rawLine.replace(/^#\s+/, '').trim();
    clubs[currentClub] = [];
    continue;
  }

  if (currentClub) {
    clubs[currentClub].push({ lineNum: i + 1, rawLine });
  }
}

function parseLine(rawLine) {
  // Clean leading bullets/dashes/spaces
  let clean = rawLine.replace(/^[-*\s]+/, '');

  let name = '';
  let rest = '';

  // Pattern 1: **Name:** rest  or **Name**: rest
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

  // Pattern 2: Name — rest or Name -- rest or Name - rest (if not caught by pattern 1)
  if (!name) {
    const sepMatch = clean.match(/^(.+?)\s*(?:—|–|---|--|-|:)\s*(.*)$/);
    if (sepMatch) {
      name = sepMatch[1].trim();
      rest = sepMatch[2].trim();
    } else {
      name = clean.trim();
      rest = '';
    }
  }

  // Clean name if bold syntax left over
  name = name.replace(/\*\*/g, '').trim();

  // Extract goal number from rest
  // Look for the first number at the start of rest, or explicit numbers
  let goals = null;

  // Case: "لم يلعب أبداً..." or "لم يلعب..." -> 0
  if (rest.includes('لم يلعب')) {
    goals = 0;
  } else {
    // Match first number in rest
    const numMatch = rest.match(/(\d+)/);
    if (numMatch) {
      goals = parseInt(numMatch[1], 10);
    } else if (rest === '' || rest.includes('انظر')) {
      // e.g. "Johnny Evans: _(انظر Jonny Evans)_"
      // No goal number stated
      goals = null;
    }
  }

  return { name, goals, rest };
}

for (const [club, clubLines] of Object.entries(clubs)) {
  console.log(`\n=== ${club} (${clubLines.length} lines) ===`);
  let nullGoalsCount = 0;
  for (const item of clubLines) {
    const parsed = parseLine(item.rawLine);
    if (parsed.goals === null) {
      console.log(`LINE ${item.lineNum}: NULL GOALS -> raw: "${item.rawLine}" | parsedName: "${parsed.name}" | rest: "${parsed.rest}"`);
      nullGoalsCount++;
    }
  }
  if (nullGoalsCount === 0) {
    console.log(`All ${clubLines.length} lines successfully parsed with numeric goals!`);
  }
}
