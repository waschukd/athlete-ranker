const fs = require('fs');
const path = 'src/app/association/dashboard/category/[catId]/groups/page.jsx';
let lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);

// Find and remove the first set of duplicate CSV/Print buttons (keep only one set)
let firstFound = -1;
let secondFound = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('exportCSV') && lines[i].includes('CSV')) {
    if (firstFound === -1) firstFound = i;
    else { secondFound = i; break; }
  }
}

if (secondFound !== -1) {
  // Remove from secondFound back to find the opening {( and forward to find closing )}
  let start = secondFound;
  let end = secondFound;
  while (start > 0 && !lines[start].includes('{groups.length')) start--;
  while (end < lines.length && !lines[end].includes('</>)}')) end++;
  lines.splice(start, end - start + 1);
  console.log('removed duplicate buttons at lines', start, '-', end);
}

fs.writeFileSync(path, lines.join('\n'));
console.log('done');
