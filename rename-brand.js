const fs = require('fs');
const path = require('path');

const replacements = [
  ['AthleteRanker', 'Sideline Star'],
  ['Athlete Ranker', 'Sideline Star'],
  ['athlete-ranker', 'sideline-star'],
  ['athleteranker.com', 'sidelinestar.com'],
  ['Sign In to Sideline Star →', 'Sign In to Sideline Star →'],
  ['PRODID:-//AthleteRanker//EN', 'PRODID:-//SidelineStar//EN'],
  ['Hockey Evaluation Platform', 'Athlete Evaluation Platform'],
];

const emailHeader = `<div style="background:#080E1A;padding:24px 32px;text-align:center;border-radius:12px 12px 0 0;">
              <div style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:0.08em;">SIDELINE STAR</div>
              <div style="font-size:11px;color:#4D8FFF;margin-top:3px;letter-spacing:0.05em;">Athlete Evaluation Platform</div>
            </div>`;

function walk(dir) {
  for (const file of fs.readdirSync(dir)) {
    const full = path.join(dir, file);
    if (fs.statSync(full).isDirectory()) { walk(full); continue; }
    if (!['.jsx', '.js'].includes(path.extname(file))) continue;
    let c = fs.readFileSync(full, 'utf8');
    let changed = false;
    for (const [from, to] of replacements) {
      const next = c.split(from).join(to);
      if (next !== c) { c = next; changed = true; }
    }
    if (changed) { fs.writeFileSync(full, c); console.log('updated:', full); }
  }
}

walk('src');
console.log('all done');
