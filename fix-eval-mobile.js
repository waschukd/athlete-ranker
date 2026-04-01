const fs = require('fs');
const path = 'src/app/evaluator/dashboard/page.jsx';
let c = fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

// 1. Fix nav - replace old logo tile + branding
c = c.replace(
  `            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF6B35] to-[#F7931E] flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Evaluator Dashboard</h1>
              <p className="text-xs text-gray-400">Athlete Ranker</p>
            </div>`,
  `            <div style={{width:"36px",height:"36px",background:"#1A6BFF",borderRadius:"9px",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <svg width="22" height="22" viewBox="0 0 100 100" fill="none"><path d="M70 15 Q80 15 80 25 L80 38 Q80 45 73 45 L45 45 Q38 45 38 52 L38 58 Q38 65 45 65 L72 65 L72 55 L85 55 L85 75 Q85 85 75 85 L30 85 Q20 85 20 75 L20 62 Q20 55 27 55 L55 55 Q62 55 62 48 L62 42 Q62 35 55 35 L28 35 L28 45 L15 45 L15 25 Q15 15 25 15 Z" fill="white"/></svg>
            </div>
            <div>
              <h1 className="text-base font-semibold text-gray-900">Sideline Star</h1>
              <p className="text-xs text-gray-400">Evaluator Portal</p>
            </div>`
);

// 2. Fix session card layout for mobile - date/time/location wrapping
c = c.replace(
  `          <div className="flex items-center gap-4 text-sm text-gray-500 flex-wrap">
              <span className="flex items-center gap-1.5"><Calendar size={13} />{formatDate(session.scheduled_date)}</span>`,
  `          <div className="grid grid-cols-1 gap-1 text-sm text-gray-500 mt-1">
              <span className="flex items-center gap-1.5"><Calendar size={13} />{formatDate(session.scheduled_date)}</span>`
);

// 3. Fix the action buttons on the card - they were overflowing on mobile
c = c.replace(
  `          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">`,
  `          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap mt-3 sm:mt-0">`
);

// 4. Make the top-level card layout stack on mobile
c = c.replace(
  `        <div className="flex items-start justify-between gap-3 flex-wrap">`,
  `        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">`
);

// 5. Fix py-8 to py-4 on mobile for more breathing room
c = c.replace(
  `      <div className="max-w-4xl mx-auto px-4 py-8">`,
  `      <div className="max-w-4xl mx-auto px-4 py-4 sm:py-8">`
);

fs.writeFileSync(path, c);
console.log('done');
