const fs = require('fs');
const path = 'src/app/api/categories/[catId]/rankings/route.js';
let lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);

// Find and replace the entire rank history block
let startLine = -1, endLine = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('Rank history: re-rank after each completed session')) startLine = i - 1;
  if (startLine > 0 && lines[i].includes('// Final sort and rank')) { endLine = i; break; }
}

console.log('replacing lines', startLine, 'to', endLine);

const newBlock = `
    // Per-session rank: rank athletes within each individual session only
    const rankHistory = {};
    for (const session of sessions) {
      const sNum = session.session_number;
      const sessionScoreList = athletes.map(a => {
        const sd = (scoreMap[a.id] || {})[sNum];
        return { id: a.id, score: sd ? sd.normalized_score : null };
      }).filter(s => s.score !== null);

      if (!sessionScoreList.length) continue;

      sessionScoreList.sort((a, b) => b.score - a.score);
      sessionScoreList.forEach((s, idx) => {
        if (!rankHistory[s.id]) rankHistory[s.id] = [];
        rankHistory[s.id].push(idx + 1);
      });
    }

    // Final sort and rank`;

lines.splice(startLine, endLine - startLine, ...newBlock.split('\n'));
fs.writeFileSync(path, lines.join('\n'));
console.log('done');
