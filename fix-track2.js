const fs = require('fs');
const files = [
  'src/app/association/dashboard/category/[catId]/page.jsx',
  'src/app/director/dashboard/page.jsx'
];
for (const file of files) {
  let lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((l, i) => {
    if (l.includes('rank_history.map') && l.includes('rank_history.length - 1')) {
      lines[i] = lines[i].replace(
        /\$\{i === a\.rank_history\.length - 1 \? "bg-\[#[A-F0-9]+\] text-white" : "bg-gray-100 text-gray-600"\}/,
        '"bg-gray-100 text-gray-600"'
      ).replace(
        /<\/span>\)\}<\/div>/,
        '</span>)}<span className="inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold bg-[#1A6BFF] text-white">{a.rank}</span></div>'
      );
      console.log('patched line', i+1, 'in', file);
    }
  });
  fs.writeFileSync(file, lines.join('\n'));
}
