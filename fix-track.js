const fs = require('fs');
const files = [
  'src/app/association/dashboard/category/[catId]/page.jsx',
  'src/app/director/dashboard/page.jsx'
];
for (const file of files) {
  let c = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  c = c.replace(
    `{hasScores && <td className="px-4 py-3 text-center">{a.rank_history?.length > 0 ? <div className="flex items-center justify-center gap-1 flex-wrap">{a.rank_history.map((r, i) => <span key={i} className={\`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold \${i === a.rank_history.length - 1 ? "bg-[#FF6B35] text-white" : "bg-gray-100 text-gray-600"}\`}>{r}</span>)}</div> : <span className="text-gray-200">-</span>}</td>}`,
    `{hasScores && <td className="px-4 py-3 text-center">{a.rank_history?.length > 0 ? <div className="flex items-center justify-center gap-1 flex-wrap">{a.rank_history.map((r, i) => <span key={i} className="inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold bg-gray-100 text-gray-600">{r}</span>)}<span className="inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold bg-[#1A6BFF] text-white">{a.rank}</span></div> : <span className="text-gray-200">-</span>}</td>}`
  );
  fs.writeFileSync(file, c);
  console.log('updated:', file);
}
