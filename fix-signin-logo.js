const fs = require('fs');
let lines = fs.readFileSync('src/app/account/signin/page.jsx','utf8').split(/\r?\n/);
lines.splice(39, 6,
  '            <img src="/s-mark-dark.svg" style={{width:"72px",height:"72px",objectFit:"contain"}} />'
);
fs.writeFileSync('src/app/account/signin/page.jsx', lines.join('\n'));
console.log('done');
