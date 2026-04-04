const fs = require('fs');

// Fix accept-invite - lines 59-63 are broken
let lines = fs.readFileSync('src/app/accept-invite/page.jsx','utf8').split(/\r?\n/);
lines.splice(58, 5,
  '        <div className="text-center mb-8">',
  '          <img src="/s-mark-dark.svg" style={{width:"48px",height:"48px",objectFit:"contain"}} />',
  '          <h1 className="text-2xl font-bold text-gray-900 mt-3">Sideline Star</h1>',
  '        </div>'
);
fs.writeFileSync('src/app/accept-invite/page.jsx', lines.join('\n'));
console.log('fixed accept-invite');

// Verify checkin is clean
lines = fs.readFileSync('src/app/checkin/page.jsx','utf8').split(/\r?\n/);
let brokenDiv = false;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim() === '</div>' && lines[i-1] && lines[i-1].trim() === '</div>' && lines[i-2] && lines[i-2].trim() === '</div>') {
    console.log('checkin possible extra div at line', i+1);
  }
}
console.log('done');
