const fs = require('fs');
const path = 'src/app/association/dashboard/category/[catId]/groups/page.jsx';
let lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);
// Remove the duplicate }; on line 220
if (lines[219].trim() === '};') {
  lines.splice(219, 1);
  console.log('removed duplicate }; at line 220');
}
fs.writeFileSync(path, lines.join('\n'));
console.log('done');
