const fs = require('fs');
const path = 'src/app/director/dashboard/page.jsx';
let lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);

// Remove the misplaced handleSmartImport (lines 892-912, 0-indexed 891-911)
lines.splice(891, 22);
console.log('removed misplaced function');

// Find the main return ( of DirectorDashboardInner
let returnIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim() === 'return (' && lines[i+1] && lines[i+1].includes('min-h-screen')) {
    returnIdx = i;
    break;
  }
}
console.log('main return at line', returnIdx+1);

lines.splice(returnIdx, 0,
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
console.log('inserted handleSmartImport before return at line', returnIdx+1);

fs.writeFileSync(path, lines.join('\n'));
console.log('done');
