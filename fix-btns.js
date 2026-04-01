const fs = require('fs');
const p = 'src/app/association/dashboard/category/[catId]/groups/page.jsx';
let c = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const OLD = '            <div className="flex items-center gap-2 flex-wrap">\n            </div>';
const NEW = '            <div className="flex items-center gap-2 flex-wrap">\n              <button onClick={() => refetch()} className="p-2 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition-colors"><RefreshCw size={15} /></button>\n              {groups.length > 0 && assignments.length > 0 && (<><button onClick={exportCSV} className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50"><Download size={14} /> CSV</button><button onClick={exportPrint} className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50"><Printer size={14} /> Print / PDF</button></>)}\n            </div>';
if (c.includes(OLD)) { c = c.replace(OLD, NEW); console.log('replaced'); }
else console.log('NO MATCH');
fs.writeFileSync(p, c);
