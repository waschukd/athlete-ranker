const fs = require('fs');

const files = [
  'src/app/association/dashboard/category/[catId]/page.jsx',
  'src/app/director/dashboard/page.jsx'
];

for (const file of files) {
  let c = fs.readFileSync(file, 'utf8');
  c = c.replace(/\r\n/g, '\n');

  // 1. Remove Sessions tab from tab list
  c = c.replace(/\s*\{ id: "sessions", label: "Sessions", icon: Trophy \},\n/g, '\n');

  // 2. Remove Settings tab from tab list
  c = c.replace(/\s*\{ id: "settings", label: "Settings", icon: Settings \},\n/g, '\n');

  // 3. Rename "Edit Setup" button to "Settings"
  c = c.replace(/<Settings size={14} \/> Edit Setup/g, '<Settings size={14} /> Settings');

  fs.writeFileSync(file, c);
  console.log('patched:', file);
}
