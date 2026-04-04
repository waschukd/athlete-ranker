const fs = require('fs');
const path = 'src/app/association/dashboard/category/[catId]/setup/page.jsx';
let lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);

// Find and remove the broken anchor block (lines 239-248 approx)
let start = -1, end = -1;
lines.forEach((l, i) => {
  if (l.includes('Anchor Player Calibration') && start === -1) start = i - 1;
  if (start > -1 && end === -1 && l.includes('</div>') && i > start + 5) end = i;
});

console.log('removing lines', start+1, 'to', end+1);
lines.splice(start, end - start + 1);
fs.writeFileSync(path, lines.join('\n'));
console.log('done');
