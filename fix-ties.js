const fs = require('fs');
const files = [
  'src/app/association/dashboard/category/[catId]/page.jsx',
  'src/app/director/dashboard/page.jsx'
];
for (const file of files) {
  let lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

  // 1. Update RankBadge to accept tied prop
  lines.forEach((l, i) => {
    if (l.includes('function RankBadge({ rank })')) {
      lines[i] = 'function RankBadge({ rank, tied }) {';
    }
    if (l.includes('return <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center"><span className="text-gray-600 text-xs font-semibold">{rank}</span></div>;')) {
      lines[i] = '  return <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{background: tied ? "#EEF2FF" : "#F3F4F6", border: tied ? "1.5px dashed #818CF8" : "none"}}><span className="text-xs font-semibold" style={{color: tied ? "#4F46E5" : "#4B5563"}}>{rank}</span></div>;';
    }
  });

  // 2. Pass tied prop to RankBadge in table
  lines.forEach((l, i) => {
    if (l.includes('<td className="px-4 py-3"><RankBadge rank={a.rank} /></td>')) {
      lines[i] = lines[i].replace(
        '<RankBadge rank={a.rank} />',
        '<RankBadge rank={a.rank} tied={sortedAthletes.filter(x => x.rank === a.rank).length > 1} />'
      );
      console.log('updated RankBadge in', file, 'at line', i+1);
    }
  });

  fs.writeFileSync(file, lines.join('\n'));
}
