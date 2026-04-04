const fs = require('fs');
const path = 'src/app/api/categories/[catId]/rankings/route.js';
let lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);
lines.forEach((l, i) => {
  if (l.includes('partials.sort')) {
    // Add rounding to partialTotal before sort so it matches final rank rounding
    lines.splice(i, 0, '      partials.forEach(p => { p.partialTotal = Math.round(p.partialTotal * 10) / 10; });');
    console.log('inserted rounding at line', i+1);
  }
});
fs.writeFileSync(path, lines.join('\n'));
console.log('done');
