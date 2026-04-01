const fs = require('fs');
const files = [
  'src/app/association/dashboard/category/[catId]/page.jsx',
  'src/app/director/dashboard/page.jsx'
];
for (const file of files) {
  let lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].includes('"teams"') && lines[i+1].includes('"reports"')) {
      const tmp = lines[i];
      lines[i] = lines[i+1];
      lines[i+1] = tmp;
      console.log('swapped at line', i+1, 'in', file);
      break;
    }
  }
  fs.writeFileSync(file, lines.join('\n'));
}
