const fs = require('fs');
const files = [
  'src/app/association/dashboard/category/[catId]/page.jsx',
  'src/app/director/dashboard/page.jsx'
];
for (const file of files) {
  let lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Manage Groups') && lines[i].includes('session=${sessionNum}') && lines[i].includes('rounded-lg')) {
      lines[i] = `                      <div className="flex items-center gap-2">
                        <button onClick={() => { setVolunteerModal({ sessionNum, entries }); setVolunteerEmails(""); }} className="text-xs px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg font-medium hover:bg-blue-100">Assign Volunteers</button>
                        ${lines[i].trim()}
                      </div>`;
      console.log('injected at line', i+1, 'in', file);
      break;
    }
  }
  fs.writeFileSync(file, lines.join('\n'));
}
