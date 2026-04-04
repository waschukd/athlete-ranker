const fs = require('fs');
const path = 'src/app/director/dashboard/page.jsx';
let lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);

// Remove ALL smartImport modal render blocks
let cleaned = [];
let skip = 0;
for (let i = 0; i < lines.length; i++) {
  if (skip > 0) { skip--; continue; }
  if (lines[i].trim() === '{smartImport && (' && lines[i+1] && lines[i+1].includes('SmartImportModal') && lines[i+2] && lines[i+2].trim() === ')}') {
    skip = 2;
    console.log('removed modal block at line', i+1);
    continue;
  }
  cleaned.push(lines[i]);
}
lines = cleaned;

// Find the </QueryClientProvider> closing line and insert modal before it
const closeIdx = lines.findIndex(l => l.includes('</QueryClientProvider>'));
lines.splice(closeIdx, 0,
  '      {smartImport && (',
  '        <SmartImportModal type={smartImport.type} headers={smartImport.headers} preview={smartImport.preview} onConfirm={handleSmartImport} onClose={() => setSmartImport(null)} />',
  '      )}'
);
console.log('added single modal before line', closeIdx+1);

// Check handleSmartImport is inside the component (before the closing })
const handleIdx = lines.findIndex(l => l.includes('const handleSmartImport = async'));
const componentCloseIdx = lines.findIndex(l => l.trim() === '}' && lines.findIndex((ll, ii) => ii > l && ll.includes('export default')) > -1);
console.log('handleSmartImport at line', handleIdx+1);

fs.writeFileSync(path, lines.join('\n'));
console.log('done');
