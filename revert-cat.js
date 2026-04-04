const { execSync } = require('child_process');
const fs = require('fs');
const content = execSync('git show 9d2b3ba:src/app/association/dashboard/category/[catId]/page.jsx').toString();
fs.writeFileSync('src/app/association/dashboard/category/[catId]/page.jsx', content, 'utf8');
console.log('done, length:', content.length);
