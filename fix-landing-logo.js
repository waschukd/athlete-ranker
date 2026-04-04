const fs = require('fs');
const lines = fs.readFileSync('src/app/landing/page.jsx','utf8').split(/\r?\n/);
// Lines 11-15 need to be the logo block - fix the broken structure
lines.splice(10, 5,
  '          <div className="flex items-center gap-3">',
  '            <img src="/s-mark-dark.svg" style={{width:"40px",height:"40px",objectFit:"contain"}} />',
  '            <span className="text-xl font-semibold">Sideline Star</span>',
  '          </div>'
);
fs.writeFileSync('src/app/landing/page.jsx', lines.join('\n'));
console.log('done');
