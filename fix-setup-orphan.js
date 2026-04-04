const fs = require('fs');
const path = 'src/app/association/dashboard/category/[catId]/setup/page.jsx';
let lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);
// Remove lines 239-240 (0-indexed 238-239) - the orphaned anchor div
lines.splice(238, 2);
fs.writeFileSync(path, lines.join('\n'));
console.log('done, line 239 is now:', lines[238]);
