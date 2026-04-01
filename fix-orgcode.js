const fs = require('fs');
const path = 'src/app/association/dashboard/page.jsx';
let c = fs.readFileSync(path, 'utf8');

c = c.replace(
  `          {org?.org_code && (`,
  `          {org?.org_code && !serviceProvider && (`
);

fs.writeFileSync(path, c);
console.log('done');
