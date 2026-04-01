const fs = require('fs');
const path = require('path');

const S_MARK = `<div style={{width:"36px",height:"36px",background:"#1A6BFF",borderRadius:"9px",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <svg width="22" height="22" viewBox="0 0 100 100" fill="none"><path d="M70 15 Q80 15 80 25 L80 38 Q80 45 73 45 L45 45 Q38 45 38 52 L38 58 Q38 65 45 65 L72 65 L72 55 L85 55 L85 75 Q85 85 75 85 L30 85 Q20 85 20 75 L20 62 Q20 55 27 55 L55 55 Q62 55 62 48 L62 42 Q62 35 55 35 L28 35 L28 45 L15 45 L15 25 Q15 15 25 15 Z" fill="white"/></svg>
            </div>`;

function processFile(filePath) {
  let c = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // Replace Zap logo icon tiles (nav/header logos) with S mark
  const zapTilePatterns = [
    // Large tiles with gradient + Zap
    [/<div className="w-12 h-12 rounded-xl bg-gradient-to-br from-\[#1A6BFF\] to-\[#4D8FFF\] flex items-center justify-center shadow-md">\s*<Zap className="w-7 h-7 text-white" \/>\s*<\/div>/g,
     `<div style={{width:"48px",height:"48px",background:"#1A6BFF",borderRadius:"12px",display:"flex",alignItems:"center",justifyContent:"center"}}><svg width="28" height="28" viewBox="0 0 100 100" fill="none"><path d="M70 15 Q80 15 80 25 L80 38 Q80 45 73 45 L45 45 Q38 45 38 52 L38 58 Q38 65 45 65 L72 65 L72 55 L85 55 L85 75 Q85 85 75 85 L30 85 Q20 85 20 75 L20 62 Q20 55 27 55 L55 55 Q62 55 62 48 L62 42 Q62 35 55 35 L28 35 L28 45 L15 45 L15 25 Q15 15 25 15 Z" fill="white"/></svg></div>`],
    [/<div className="w-11 h-11 rounded-xl bg-gradient-to-br from-\[#1A6BFF\] to-\[#4D8FFF\] flex items-center justify-center shadow-md"><Zap className="w-6 h-6 text-white" \/><\/div>/g,
     `<div style={{width:"44px",height:"44px",background:"#1A6BFF",borderRadius:"11px",display:"flex",alignItems:"center",justifyContent:"center"}}><svg width="26" height="26" viewBox="0 0 100 100" fill="none"><path d="M70 15 Q80 15 80 25 L80 38 Q80 45 73 45 L45 45 Q38 45 38 52 L38 58 Q38 65 45 65 L72 65 L72 55 L85 55 L85 75 Q85 85 75 85 L30 85 Q20 85 20 75 L20 62 Q20 55 27 55 L55 55 Q62 55 62 48 L62 42 Q62 35 55 35 L28 35 L28 45 L15 45 L15 25 Q15 15 25 15 Z" fill="white"/></svg></div>`],
    [/<div className="w-10 h-10 rounded-xl bg-gradient-to-br from-\[#1A6BFF\] to-\[#4D8FFF\] flex items-center justify-center"><Zap className="w-6 h-6 text-white" \/><\/div>/g,
     `<div style={{width:"40px",height:"40px",background:"#1A6BFF",borderRadius:"10px",display:"flex",alignItems:"center",justifyContent:"center"}}><svg width="24" height="24" viewBox="0 0 100 100" fill="none"><path d="M70 15 Q80 15 80 25 L80 38 Q80 45 73 45 L45 45 Q38 45 38 52 L38 58 Q38 65 45 65 L72 65 L72 55 L85 55 L85 75 Q85 85 75 85 L30 85 Q20 85 20 75 L20 62 Q20 55 27 55 L55 55 Q62 55 62 48 L62 42 Q62 35 55 35 L28 35 L28 45 L15 45 L15 25 Q15 15 25 15 Z" fill="white"/></svg></div>`],
    // Small tiles
    [/<div className="w-8 h-8 rounded-lg bg-gradient-to-br from-\[#1A6BFF\] to-\[#4D8FFF\] flex items-center justify-center"><Zap className="w-5 h-5 text-white" \/><\/div>/g,
     `<div style={{width:"32px",height:"32px",background:"#1A6BFF",borderRadius:"8px",display:"flex",alignItems:"center",justifyContent:"center"}}><svg width="18" height="18" viewBox="0 0 100 100" fill="none"><path d="M70 15 Q80 15 80 25 L80 38 Q80 45 73 45 L45 45 Q38 45 38 52 L38 58 Q38 65 45 65 L72 65 L72 55 L85 55 L85 75 Q85 85 75 85 L30 85 Q20 85 20 75 L20 62 Q20 55 27 55 L55 55 Q62 55 62 48 L62 42 Q62 35 55 35 L28 35 L28 45 L15 45 L15 25 Q15 15 25 15 Z" fill="white"/></svg></div>`],
  ];

  for (const [pattern, replacement] of zapTilePatterns) {
    const next = c.replace(pattern, replacement);
    if (next !== c) { c = next; changed = true; }
  }

  // Fix stat card gradient colors -> flat blue
  const gradientFixes = [
    ['from-[#3B82F6] to-[#8B5CF6]', 'bg-[#1A6BFF]'],
    ['from-[#22C55E] to-[#10B981]', 'bg-[#1A6BFF]'],
    ['from-[#F7931E] to-[#FBBF24]', 'bg-[#1A6BFF]'],
    ['from-[#4D8FFF] to-[#FBBF24]', 'bg-[#1A6BFF]'],
  ];
  for (const [from, to] of gradientFixes) {
    const next = c.replace(new RegExp(from.replace(/[[\]]/g, '\\$&'), 'g'), to);
    if (next !== c) { c = next; changed = true; }
  }

  // Fix the stat card container - remove bg-gradient-to-br wrapper and just use bg-[#1A6BFF]
  const statCardFix = c.replace(
    /className=\{`p-4 rounded-xl bg-gradient-to-br \$\{color\} shadow-md`\}/g,
    'className="p-4 rounded-xl bg-[#1A6BFF]"'
  );
  if (statCardFix !== c) { c = statCardFix; changed = true; }

  // Fix stat card bg-gradient-to-br on container cards
  const cardFix = c.replace(
    /className="bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-2xl p-6 hover:shadow-lg transition-shadow"/g,
    'className="bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-lg transition-shadow"'
  );
  if (cardFix !== c) { c = cardFix; changed = true; }

  if (changed) {
    fs.writeFileSync(filePath, c);
    console.log('updated:', filePath);
  }
}

function walk(dir) {
  for (const file of fs.readdirSync(dir)) {
    const full = path.join(dir, file);
    if (fs.statSync(full).isDirectory()) { walk(full); continue; }
    if (['.jsx', '.js'].includes(path.extname(file))) processFile(full);
  }
}

walk('src');
console.log('done');
