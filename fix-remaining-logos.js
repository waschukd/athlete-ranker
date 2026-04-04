const fs = require('fs');

const fixes = [
  {
    file: 'src/app/checkin/page.jsx',
    startLine: 50,
    count: 6,
    replacement: [
      '        <div className="text-center mb-8">',
      '          <img src="/s-mark-dark.svg" style={{width:"56px",height:"56px",objectFit:"contain"}} />',
      '          <h1 className="text-2xl font-bold text-gray-900 mt-4">Player Check-in</h1>',
      '          <p className="text-gray-500 text-sm mt-1">Enter your session code to begin</p>',
      '        </div>',
    ]
  },
  {
    file: 'src/app/accept-invite/page.jsx',
    startLine: 59,
    count: 3,
    replacement: [
      '        <div className="text-center mb-8">',
      '          <img src="/s-mark-dark.svg" style={{width:"48px",height:"48px",objectFit:"contain"}} />',
      '        </div>',
    ]
  }
];

for (const fix of fixes) {
  let lines = fs.readFileSync(fix.file,'utf8').split(/\r?\n/);
  lines.splice(fix.startLine - 1, fix.count, ...fix.replacement);
  fs.writeFileSync(fix.file, lines.join('\n'));
  console.log('fixed:', fix.file);
}
