const fs = require('fs');
const path = 'src/app/director/dashboard/page.jsx';
let lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);

// Remove handleSmartImport function and modal from DirectorDashboardPage (lines ~992+)
// Find export default function line
const exportIdx = lines.findIndex(l => l.includes('export default function DirectorDashboardPage'));
console.log('export default at line', exportIdx+1);

// Remove lines from exportIdx to end, rebuild clean
const before = lines.slice(0, exportIdx);

const after = [
  '',
  'export default function DirectorDashboardPage() {',
  '  return (',
  '    <QueryClientProvider client={qc}>',
  '      <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1A6BFF]" /></div>}>',
  '        <DirectorDashboardInner />',
  '      </Suspense>',
  '    </QueryClientProvider>',
  '  );',
  '}',
];

// Now find where to add modal and handleSmartImport inside DirectorDashboardInner
// Add modal before the closing return of DirectorDashboardInner
// Find the last </div> before the closing ); } of the inner component
let innerCloseIdx = -1;
for (let i = exportIdx - 1; i >= 0; i--) {
  if (before[i].includes('</QueryClientProvider>') || (before[i].trim() === ');' && before[i-1] && before[i-1].trim() === '</div>')) {
    innerCloseIdx = i;
    break;
  }
}
console.log('inner component closes around line', innerCloseIdx+1);

// Insert modal before the closing of inner component
before.splice(innerCloseIdx, 0,
  '      {smartImport && (',
  '        <SmartImportModal type={smartImport.type} headers={smartImport.headers} preview={smartImport.preview} onConfirm={handleSmartImport} onClose={() => setSmartImport(null)} />',
  '      )}'
);

// Insert handleSmartImport before the return statement of inner component
let returnIdx = -1;
for (let i = innerCloseIdx - 1; i >= 0; i--) {
  if (before[i].trim() === 'return (' && before[i-1] && !before[i-1].includes('function')) {
    returnIdx = i;
    break;
  }
}
console.log('return statement at line', returnIdx+1);

before.splice(returnIdx, 0,
  '  const handleSmartImport = async (mapping) => {',
  '    if (!smartImport) return;',
  '    setImporting(true);',
  '    const { type, headers, rawLines } = smartImport;',
  '    const dataLines = rawLines.slice(1);',
  '    if (type === "athletes") {',
  '      const rows = dataLines.map(line => { const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, "")); const obj = {}; headers.forEach((h, idx) => obj[h] = cols[idx] || ""); return { first_name: mapping.first_name ? obj[mapping.first_name] || "" : "", last_name: mapping.last_name ? obj[mapping.last_name] || "" : "", external_id: mapping.external_id ? obj[mapping.external_id] || "" : "", position: mapping.position ? obj[mapping.position] || "" : "", birth_year: mapping.birth_year ? obj[mapping.birth_year] || "" : "" }; }).filter(r => r.first_name && r.last_name);',
  '      const res = await fetch(`/api/categories/${catId}/athletes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ athletes: rows }) });',
  '      const data = await res.json();',
  '      setUploadMsg(`✓ ${data.inserted || 0} athletes imported, ${data.skipped || 0} skipped`);',
  '      refetchAthletes(); refetchRankings();',
  '    } else {',
  '      const rows = dataLines.map(line => { const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, "")); const obj = {}; headers.forEach((h, idx) => obj[h] = cols[idx] || ""); return { session_number: mapping.session_number ? obj[mapping.session_number] : "", group_number: mapping.group_number ? obj[mapping.group_number] : "", scheduled_date: mapping.scheduled_date ? obj[mapping.scheduled_date] : "", start_time: mapping.start_time ? obj[mapping.start_time] : "", end_time: mapping.end_time ? obj[mapping.end_time] : "", location: mapping.location ? obj[mapping.location] : "", evaluators_required: mapping.evaluators_required ? obj[mapping.evaluators_required] : "" }; }).filter(r => r.session_number && r.scheduled_date);',
  '      const res = await fetch(`/api/categories/${catId}/schedule`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schedule: rows }) });',
  '      const data = await res.json();',
  '      setUploadMsg(data.success ? `✓ ${data.count} entries uploaded` : "Error: " + data.error);',
  '      if (data.success) { refetchSchedule(); refetchRankings(); }',
  '    }',
  '    setSmartImport(null); setImporting(false);',
  '    setTimeout(() => setUploadMsg(""), 5000);',
  '  };',
  ''
);

const result = [...before, ...after];
fs.writeFileSync(path, result.join('\n'));
console.log('done');
