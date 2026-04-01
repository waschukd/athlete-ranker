const fs = require('fs');

const files = [
  'src/app/association/dashboard/category/[catId]/page.jsx',
  'src/app/director/dashboard/page.jsx'
];

for (const file of files) {
  let c = fs.readFileSync(file, 'utf8');
  c = c.replace(/\r\n/g, '\n');

  // Swap Reports and Teams in tab order
  c = c.replace(
    '{ id: "reports", label: "Reports", icon: FileText },\n    { id: "teams", label: "Teams", icon: Users },',
    '{ id: "teams", label: "Teams", icon: Users },\n    { id: "reports", label: "Reports", icon: FileText },'
  );
  c = c.replace(
    '{ id: "reports", label: "Reports", icon: BarChart3 },\n    { id: "teams", label: "Teams", icon: Users },',
    '{ id: "teams", label: "Teams", icon: Users },\n    { id: "reports", label: "Reports", icon: BarChart3 },'
  );

  fs.writeFileSync(file, c);
  console.log('patched:', file);
}
