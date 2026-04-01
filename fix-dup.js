const fs = require('fs');
const path = 'src/app/association/dashboard/page.jsx';
let c = fs.readFileSync(path, 'utf8');
c = c.replace(
  `  const org = orgData?.organization;
  const serviceProvider = orgData?.service_provider || null;
  const serviceProvider = orgData?.service_provider || null;`,
  `  const org = orgData?.organization;
  const serviceProvider = orgData?.service_provider || null;`
);
fs.writeFileSync(path, c);
console.log('done');
