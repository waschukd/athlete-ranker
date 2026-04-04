const fs = require('fs');
const files = [
  'src/app/association/dashboard/category/[catId]/page.jsx',
  'src/app/director/dashboard/page.jsx'
];
for (const file of files) {
  let lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((l, i) => {
    if (l.includes('filteredAthletes.map(a =>')) {
      lines[i] = lines[i].replace('filteredAthletes.map(a =>', 'sortedAthletes.map(a =>');
      console.log('fixed line', i+1, 'in', file);
    }
  });
  fs.writeFileSync(file, lines.join('\n'));
}
