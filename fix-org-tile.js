const fs = require('fs');
const files = [
  'src/app/association/dashboard/page.jsx',
  'src/app/director/dashboard/page.jsx'
];
for (const file of files) {
  let lines = fs.readFileSync(file,'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('w-12 h-12 rounded-xl') && lines[i+1] && lines[i+1].includes('Zap')) {
      lines.splice(i, 2,
        '                <div className="w-12 h-12 rounded-xl bg-[#1A6BFF] flex items-center justify-center shadow-md flex-shrink-0">',
        '                  <span className="text-white text-xl font-bold">{org?.name?.[0] || "A"}</span>',
        '                </div>'
      );
      console.log('fixed org tile in', file);
      break;
    }
  }
  fs.writeFileSync(file, lines.join('\n'));
}
