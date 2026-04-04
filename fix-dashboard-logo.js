const fs = require('fs');

// Fix evaluator dashboard - remove the dangling </div> after img on line 337
let lines = fs.readFileSync('src/app/evaluator/dashboard/page.jsx','utf8').split(/\r?\n/);
lines.forEach((l,i) => {
  if(l.includes('s-mark') && lines[i+1] && lines[i+1].trim() === '</div>') {
    lines.splice(i+1, 1);
    console.log('removed dangling div at line', i+2);
  }
});
fs.writeFileSync('src/app/evaluator/dashboard/page.jsx', lines.join('\n'));

console.log('done');
