const fs = require('fs');
const path = 'src/app/director/dashboard/page.jsx';
let lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);

// Remove modal from wrong position (lines 1011-1013, 0-indexed 1010-1012)
lines.splice(1009, 4);

// Insert modal before </div></div> closing (now at line 1009-1010)
lines.splice(1008, 0,
  '      {smartImport && (',
  '        <SmartImportModal type={smartImport.type} headers={smartImport.headers} preview={smartImport.preview} onConfirm={handleSmartImport} onClose={() => setSmartImport(null)} />',
  '      )}'
);

fs.writeFileSync(path, lines.join('\n'));
console.log('done');
