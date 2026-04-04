const fs = require('fs');
const path = 'src/app/api/categories/[catId]/rankings/route.js';
let lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);
lines.forEach((l, i) => {
  if (l.includes('currentRank = (i > 0 && a.weighted_total === withTotals[i - 1].weighted_total)')) {
    lines[i] = '      currentRank = (i > 0 && a.weighted_total === withTotals[i - 1].weighted_total) ? currentRank : i + 1;';
    console.log('fixed tie rank at line', i+1);
  }
  if (l.includes('? withTotals[i - 1].rank : i + 1;')) {
    lines.splice(i, 1);
    console.log('removed broken line', i+1);
  }
});
fs.writeFileSync(path, lines.join('\n'));
console.log('done');
