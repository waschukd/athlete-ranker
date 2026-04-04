const fs = require('fs');
const path = 'src/app/association/dashboard/category/[catId]/setup/page.jsx';
let lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);
// Line 238 (0-indexed 237) is </button> closing
// Line 239 (0-indexed 238) should be </div> then <p>
// Insert missing </div> before the <p>
lines.splice(238, 0, '        </div>');
fs.writeFileSync(path, lines.join('\n'));
console.log('done, lines 237-242:');
for(let i=236;i<243;i++) console.log(i+1, lines[i]);
