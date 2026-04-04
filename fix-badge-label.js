const fs = require('fs');
const files = [
  'src/app/association/dashboard/category/[catId]/page.jsx',
  'src/app/director/dashboard/page.jsx'
];
for (const file of files) {
  let lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((l, i) => {
    if (l.includes('const label = rank ?? "=";')) {
      lines[i] = lines[i].replace('const label = rank ?? "=";  return', 'return').replace('{label}', '{rank}');
      console.log('fixed in', file, 'at line', i+1);
    }
  });
  fs.writeFileSync(file, lines.join('\n'));
}
