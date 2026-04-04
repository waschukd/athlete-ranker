const fs = require('fs');
const files = [
  'src/app/association/dashboard/category/[catId]/page.jsx',
  'src/app/director/dashboard/page.jsx'
];
for (const file of files) {
  let lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((l, i) => {
    if (l.includes('return <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{background:tied')) {
      lines[i] = '  const label = rank ?? "=";  return <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{background:tied?"#EEF2FF":"#F3F4F6",border:tied?"1.5px dashed #818CF8":"none"}}><span className="text-xs font-semibold" style={{color:tied?"#4F46E5":"#4B5563"}}>{label}</span></div>;';
      console.log('fixed in', file);
    }
  });
  fs.writeFileSync(file, lines.join('\n'));
}
