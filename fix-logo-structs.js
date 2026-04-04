const fs = require('fs');

// Fix evaluator signup - lines 77-84
let lines = fs.readFileSync('src/app/evaluator/signup/page.jsx','utf8').split(/\r?\n/);
lines.splice(76, 8,
  '        <div className="flex items-center gap-3 mb-8">',
  '          <img src="/s-mark-dark.svg" style={{width:"40px",height:"40px",objectFit:"contain"}} />',
  '          <div>',
  '            <h1 className="text-lg font-bold text-gray-900">Sideline Star</h1>',
  '            <p className="text-xs text-gray-400">Evaluator Sign Up</p>',
  '          </div>',
  '        </div>'
);
fs.writeFileSync('src/app/evaluator/signup/page.jsx', lines.join('\n'));
console.log('fixed signup');

// Fix accept-invite - check structure
lines = fs.readFileSync('src/app/accept-invite/page.jsx','utf8').split(/\r?\n/);
lines.forEach((l,i) => { if(l.includes('s-mark')) console.log('accept-invite L'+(i+1)+':', lines[i-1], '|', l, '|', lines[i+1]); });

// Fix checkin - check structure  
lines = fs.readFileSync('src/app/checkin/page.jsx','utf8').split(/\r?\n/);
lines.forEach((l,i) => { if(l.includes('s-mark')) console.log('checkin L'+(i+1)+':', lines[i-1], '|', l, '|', lines[i+1]); });

// Fix evaluator dashboard - check structure
lines = fs.readFileSync('src/app/evaluator/dashboard/page.jsx','utf8').split(/\r?\n/);
lines.forEach((l,i) => { if(l.includes('s-mark')) console.log('dashboard L'+(i+1)+':', lines[i-1], '|', l, '|', lines[i+1]); });
