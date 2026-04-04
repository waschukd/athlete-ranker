const fs = require('fs');
const files = [
  'src/app/association/dashboard/category/[catId]/page.jsx',
  'src/app/director/dashboard/page.jsx'
];
for (const file of files) {
  let lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((l, i) => {
    if (l.includes('function RankBadge({ rank, tied })')) {
      lines.splice(i, 6,
        'function RankBadge({ rank, tied }) {',
        '  if (rank === 1) return <div className="w-7 h-7 rounded-full bg-yellow-400 flex items-center justify-center"><Medal size={13} className="text-white" /></div>;',
        '  if (rank === 2) return <div className="w-7 h-7 rounded-full bg-gray-300 flex items-center justify-center"><span className="text-white text-xs font-bold">2</span></div>;',
        '  if (rank === 3) return <div className="w-7 h-7 rounded-full bg-amber-600 flex items-center justify-center"><span className="text-white text-xs font-bold">3</span></div>;',
        '  return <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{background:tied?"#EEF2FF":"#F3F4F6",border:tied?"1.5px dashed #818CF8":"none"}}><span className="text-xs font-semibold" style={{color:tied?"#4F46E5":"#4B5563"}}>{rank}</span></div>;',
        '}'
      );
      console.log('fixed RankBadge in', file);
    }
  });
  fs.writeFileSync(file, lines.join('\n'));
}
