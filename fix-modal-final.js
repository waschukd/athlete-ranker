const fs = require('fs');
const path = 'src/app/director/dashboard/page.jsx';
let lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);

// Remove modal from current position (lines 1009-1011, 0-indexed 1008-1010)
lines.splice(1008, 3);

// Insert it before </div> at line 1009 (now 1009 after splice)
lines.splice(1008, 0,
  '      {smartImport && (',
  '        <SmartImportModal type={smartImport.type} headers={smartImport.headers} preview={smartImport.preview} onConfirm={handleSmartImport} onClose={() => setSmartImport(null)} />',
  '      )}'
);

fs.writeFileSync(path, lines.join('\n'));

// Verify
const newLines = fs.readFileSync(path, 'utf8').split(/\r?\n/);
for(let i=1005;i<1016;i++) console.log(i+1, newLines[i]);
