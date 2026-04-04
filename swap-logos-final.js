const fs = require('fs');

const edits = [
  {
    file: 'src/app/landing/page.jsx',
    lines: [12, 13],
    replacement: '              <img src="/s-mark-dark.svg" style={{width:"40px",height:"40px",objectFit:"contain"}} />'
  },
  {
    file: 'src/app/evaluator/dashboard/page.jsx',
    lines: [335, 336],
    replacement: '            <img src="/s-mark-dark.svg" style={{width:"40px",height:"40px",objectFit:"contain"}} />'
  },
  {
    file: 'src/app/evaluator/signup/page.jsx',
    lines: [78, 79],
    replacement: '              <img src="/s-mark-dark.svg" style={{width:"40px",height:"40px",objectFit:"contain",boxShadow:"0 2px 8px rgba(0,0,0,0.15)"}} />'
  },
  {
    file: 'src/app/accept-invite/page.jsx',
    lines: [60, 61],
    replacement: '            <img src="/s-mark-dark.svg" style={{width:"48px",height:"48px",objectFit:"contain"}} />'
  },
  {
    file: 'src/app/checkin/page.jsx',
    lines: [52, 53],
    replacement: '              <img src="/s-mark-dark.svg" style={{width:"56px",height:"56px",objectFit:"contain"}} />'
  },
];

for (const edit of edits) {
  const lines = fs.readFileSync(edit.file, 'utf8').split(/\r?\n/);
  const [start, end] = edit.lines;
  lines.splice(start - 1, end - start + 1, edit.replacement);
  fs.writeFileSync(edit.file, lines.join('\n'));
  console.log('updated:', edit.file, 'lines', start, '-', end);
}

// Signin page - find and replace the icon block
const signinPath = 'src/app/account/signin/page.jsx';
let signin = fs.readFileSync(signinPath, 'utf8').split(/\r?\n/);
signin.forEach((l, i) => {
  if (l.includes('s-mark') || (l.includes('img') && l.includes('mark'))) {
    signin[i] = '          <img src="/s-mark-dark.svg" style={{width:"72px",height:"72px",objectFit:"contain",margin:"0 auto 8px"}} />';
    console.log('updated signin at line', i+1);
  }
});
fs.writeFileSync(signinPath, signin.join('\n'));

console.log('all done');
