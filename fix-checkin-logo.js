const fs = require('fs');
let lines = fs.readFileSync('src/app/checkin/page.jsx','utf8').split(/\r?\n/);
lines.splice(49, 6,
  '      <div className="w-full max-w-md">',
  '        <div className="text-center mb-8">',
  '          <img src="/s-mark-dark.svg" style={{width:"56px",height:"56px",objectFit:"contain"}} />',
  '          <h1 className="text-2xl font-bold text-gray-900 mt-4">Player Check-in</h1>',
  '          <p className="text-gray-500 text-sm mt-1">Enter your session code to begin</p>',
  '        </div>'
);
fs.writeFileSync('src/app/checkin/page.jsx', lines.join('\n'));
console.log('done');
