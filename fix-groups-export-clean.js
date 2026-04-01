const fs = require('fs');
const path = 'src/app/association/dashboard/category/[catId]/groups/page.jsx';
let c = fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

// Add icons to import
c = c.replace(
  '  ArrowLeft, Users, Shuffle, Check, AlertCircle,\n  GripVertical, ChevronRight, Copy, ExternalLink, RefreshCw',
  '  ArrowLeft, Users, Shuffle, Check, AlertCircle,\n  GripVertical, ChevronRight, Copy, ExternalLink, RefreshCw, Download, Printer'
);

// Find the line with "const goalies" and inject export functions after it
c = c.replace(
  '  const goalies = groupsData?.goalies || [];',
  `  const goalies = groupsData?.goalies || [];
  const currentSession = sessions.find(s => s.session_number === selectedSession);

  const exportCSV = () => {
    const rows = [['Group','Date','Time','Location','Last Name','First Name','ID','Position']];
    for (const group of groups) {
      const players = assignments.filter(a => a.session_group_id === group.id);
      const sample = players[0];
      const date = sample?.scheduled_date ? new Date(sample.scheduled_date).toLocaleDateString() : '';
      const time = sample?.start_time && sample?.end_time ? sample.start_time + ' - ' + sample.end_time : (sample?.start_time || '');
      const loc = sample?.location || '';
      for (const player of players) {
        rows.push(['Group ' + group.group_number, date, time, loc, player.last_name, player.first_name, player.external_id || '', player.position || '']);
      }
    }
    const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (currentSession?.name || 'Session ' + selectedSession) + '_groups.csv';
    a.click();
  };

  const exportPrint = () => {
    const sessionName = currentSession?.name || 'Session ' + selectedSession;
    const catName = setupData?.category?.name || '';
    let html = '<html><head><title>' + catName + ' - ' + sessionName + '</title><style>';
    html += 'body{font-family:Arial,sans-serif;padding:20px;color:#111}h1{font-size:20px;margin-bottom:4px}.subtitle{font-size:13px;color:#555;margin-bottom:24px}.group{margin-bottom:28px;page-break-inside:avoid}.group-header{background:#1A6BFF;color:white;padding:8px 14px;border-radius:6px 6px 0 0;font-size:14px;font-weight:bold}table{width:100%;border-collapse:collapse;font-size:13px}th{background:#f3f4f6;padding:7px 10px;text-align:left;font-size:12px;text-transform:uppercase;border-bottom:1px solid #e5e7eb}td{padding:7px 10px;border-bottom:1px solid #f3f4f6}tr:last-child td{border-bottom:none}@media print{.group{page-break-inside:avoid}}';
    html += '</style></head><body>';
    html += '<h1>' + catName + ' \u2014 ' + sessionName + '</h1>';
    html += '<div class="subtitle">Generated ' + new Date().toLocaleDateString() + '</div>';
    for (const group of groups) {
      const players = assignments.filter(a => a.session_group_id === group.id);
      const sample = players[0];
      const date = sample?.scheduled_date ? new Date(sample.scheduled_date).toLocaleDateString('en-CA',{weekday:'long',year:'numeric',month:'long',day:'numeric'}) : '';
      const time = sample?.start_time && sample?.end_time ? sample.start_time + ' \u2013 ' + sample.end_time : (sample?.start_time || '');
      const loc = sample?.location || '';
      html += '<div class="group"><div class="group-header">Group ' + group.group_number;
      if (date||time||loc) html += ' | ' + [date,time,loc].filter(Boolean).join(' \u00b7 ');
      html += '</div><table><thead><tr><th>#</th><th>Last Name</th><th>First Name</th><th>ID</th><th>Position</th></tr></thead><tbody>';
      players.forEach((pl,i) => { html += '<tr><td>'+(i+1)+'</td><td>'+pl.last_name+'</td><td>'+pl.first_name+'</td><td>'+(pl.external_id||'\u2014')+'</td><td>'+(pl.position||'\u2014')+'</td></tr>'; });
      html += '</tbody></table></div>';
    }
    html += '</body></html>';
    const w = window.open('','_blank');
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 500);
  };`
);

// Add buttons next to RefreshCw
c = c.replace(
  '              <button onClick={() => refetch()}\n                className="p-2 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition-colors">\n                <RefreshCw size={15} />\n              </button>',
  `              <button onClick={() => refetch()} className="p-2 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition-colors">
                <RefreshCw size={15} />
              </button>
              {groups.length > 0 && assignments.length > 0 && (<>
                <button onClick={exportCSV} className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50"><Download size={14} /> CSV</button>
                <button onClick={exportPrint} className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50"><Printer size={14} /> Print / PDF</button>
              </>)}`
);

fs.writeFileSync(path, c);
console.log('done');
