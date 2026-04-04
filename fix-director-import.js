const fs = require('fs');
const path = 'src/app/director/dashboard/page.jsx';
let lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);

// Remove duplicate modal renders - keep only the last one before </QueryClientProvider>
let modalLines = [];
let i = lines.length - 1;
let foundClose = false;
while (i >= 0) {
  if (lines[i].includes('</QueryClientProvider>') && !foundClose) { foundClose = true; }
  if (foundClose && lines[i].includes('{smartImport && (')) {
    // Remove this block (3 lines)
    lines.splice(i, 3);
    console.log('removed modal at line', i+1);
  }
  i--;
}

// Add single modal render before </QueryClientProvider>
lines.forEach((l, i) => {
  if (l.includes('</QueryClientProvider>') && lines[i+1] && lines[i+1].trim() === ');') {
    lines.splice(i, 0,
      '      {smartImport && (',
      '        <SmartImportModal type={smartImport.type} headers={smartImport.headers} preview={smartImport.preview} onConfirm={handleSmartImport} onClose={() => setSmartImport(null)} />',
      '      )}'
    );
    console.log('added single modal at line', i+1);
  }
});

// Find and fix handleSmartImport - make sure it's inside the component
// Check if it's outside by looking for it after the component closing
let handleStart = -1;
lines.forEach((l, i) => {
  if (l.includes('const handleSmartImport = async')) handleStart = i;
});
console.log('handleSmartImport at line', handleStart + 1);

fs.writeFileSync(path, lines.join('\n'));
console.log('done');
