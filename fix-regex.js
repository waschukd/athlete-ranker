const fs = require('fs');
const files = [
  'src/app/association/dashboard/category/[catId]/page.jsx',
  'src/app/director/dashboard/page.jsx'
];
for (const file of files) {
  let c = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  c = c.replace(
    'const emails = volunteerEmails.split(/[,\n]/).map(e => e.trim()).filter(Boolean);',
    'const emails = volunteerEmails.split(/[,\\n]/).map(e => e.trim()).filter(Boolean);'
  );
  fs.writeFileSync(file, c);
  console.log('fixed:', file);
}
