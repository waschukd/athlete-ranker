const fs = require('fs');
const path = 'src/app/director/dashboard/page.jsx';
let lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);

// Add SmartImportModal import after "use client"
lines[0] = '"use client";\nimport SmartImportModal from "@/components/SmartImportModal";';

// Add smartImport state after importing state
lines.forEach((l, i) => {
  if (l.includes('const [importing, setImporting] = useState(false);')) {
    lines.splice(i + 1, 0, '  const [smartImport, setSmartImport] = useState(null);');
    console.log('added smartImport state at line', i+2);
  }
});

// Replace schedule upload input
let scheduleInputStart = -1, scheduleInputEnd = -1;
lines.forEach((l, i) => {
  if (l.includes('↑ Upload / Update CSV') && scheduleInputStart === -1) {
    // find the input tag
    for (let j = i; j < i + 5; j++) {
      if (lines[j].includes('<input type="file"') && lines[j].includes('schedule')) { scheduleInputStart = j; break; }
      if (lines[j].includes('<input type="file"')) { scheduleInputStart = j; break; }
    }
  }
});

// Find the closing }} /> of the schedule input
if (scheduleInputStart > -1) {
  for (let j = scheduleInputStart; j < scheduleInputStart + 30; j++) {
    if (lines[j].includes('}} />')) { scheduleInputEnd = j; break; }
  }
  lines.splice(scheduleInputStart, scheduleInputEnd - scheduleInputStart + 1,
    '                  <input type="file" accept=".csv" className="hidden" disabled={importing} onChange={async (e) => {',
    '                    const file = e.target.files[0]; if (!file) return;',
    '                    const text = await file.text();',
    '                    const lines2 = text.trim().split("\\n").filter(l => l.trim());',
    '                    const rawHeaders = lines2[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));',
    '                    const preview = lines2.slice(1, 4).map(line => { const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, "")); const obj = {}; rawHeaders.forEach((h, i) => obj[h] = cols[i] || ""); return obj; });',
    '                    setSmartImport({ type: "schedule", headers: rawHeaders, preview, rawLines: lines2 });',
    '                    e.target.value = "";',
    '                  }} />'
  );
  console.log('replaced schedule upload');
}

// Replace athlete upload input
let athleteInputStart = -1, athleteInputEnd = -1;
lines.forEach((l, i) => {
  if (l.includes('↑ Upload CSV') && athleteInputStart === -1) {
    for (let j = i; j < i + 5; j++) {
      if (lines[j].includes('<input type="file"')) { athleteInputStart = j; break; }
    }
  }
});
if (athleteInputStart > -1) {
  for (let j = athleteInputStart; j < athleteInputStart + 40; j++) {
    if (lines[j].includes('}} />')) { athleteInputEnd = j; break; }
  }
  lines.splice(athleteInputStart, athleteInputEnd - athleteInputStart + 1,
    '                  <input type="file" accept=".csv" className="hidden" disabled={importing} onChange={async (e) => {',
    '                    const file = e.target.files[0]; if (!file) return;',
    '                    const text = await file.text();',
    '                    const lines2 = text.trim().split("\\n").filter(l => l.trim());',
    '                    const rawHeaders = lines2[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));',
    '                    const preview = lines2.slice(1, 4).map(line => { const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, "")); const obj = {}; rawHeaders.forEach((h, i) => obj[h] = cols[i] || ""); return obj; });',
    '                    setSmartImport({ type: "athletes", headers: rawHeaders, preview, rawLines: lines2 });',
    '                    e.target.value = "";',
    '                  }} />'
  );
  console.log('replaced athlete upload');
}

// Add handleSmartImport function and modal before closing return
lines.forEach((l, i) => {
  if (l.includes('return (') && lines[i+1] && lines[i+1].includes('QueryClientProvider')) {
    lines.splice(i, 0,
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
    console.log('added handleSmartImport at line', i+1);
  }
});

// Add modal before last closing tag
lines.forEach((l, i) => {
  if (l.includes('</QueryClientProvider>') && lines[i+1] && lines[i+1].includes(');')) {
    lines.splice(i, 0,
      '      {smartImport && (',
      '        <SmartImportModal type={smartImport.type} headers={smartImport.headers} preview={smartImport.preview} onConfirm={handleSmartImport} onClose={() => setSmartImport(null)} />',
      '      )}'
    );
    console.log('added modal render');
  }
});

fs.writeFileSync(path, lines.join('\n'));
console.log('director dashboard patched');
