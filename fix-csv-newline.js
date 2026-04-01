const fs = require('fs');
const path = 'src/app/association/dashboard/category/[catId]/groups/page.jsx';
let c = fs.readFileSync(path, 'utf8');
c = c.replace(
  "const csv = rows.map(r => r.map(v => '\"' + String(v).replace(/\"/g, '\"\"') + '\"').join(',')).join('\n');",
  "const csv = rows.map(r => r.map(v => '\"' + String(v).replace(/\"/g, '\"\"') + '\"').join(',')).join('\\n');"
);
fs.writeFileSync(path, c);
console.log('done');
