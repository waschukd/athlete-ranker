const fs = require('fs');

// 1. Patch groups route to include schedule date/time/location
const routePath = 'src/app/api/categories/[catId]/groups/route.js';
let r = fs.readFileSync(routePath, 'utf8');

r = r.replace(
  `            es.checkin_code, es.id as schedule_id\n          FROM player_group_assignments pga\n          JOIN athletes a ON a.id = pga.athlete_id\n          JOIN session_groups sg ON sg.id = pga.session_group_id\n          LEFT JOIN evaluation_schedule es ON es.age_category_id = \${catId}\n            AND es.session_number = sg.session_number AND es.group_number = sg.group_number\n          LEFT JOIN player_checkins pc ON pc.athlete_id = a.id AND pc.schedule_id = es.id\n          WHERE sg.age_category_id = \${catId} AND sg.session_number = \${sessionNum}\n          ORDER BY sg.group_number, pga.display_order, a.last_name\``,
  `            es.checkin_code, es.id as schedule_id,\n            es.scheduled_date, es.start_time, es.end_time, es.location\n          FROM player_group_assignments pga\n          JOIN athletes a ON a.id = pga.athlete_id\n          JOIN session_groups sg ON sg.id = pga.session_group_id\n          LEFT JOIN evaluation_schedule es ON es.age_category_id = \${catId}\n            AND es.session_number = sg.session_number AND es.group_number = sg.group_number\n          LEFT JOIN player_checkins pc ON pc.athlete_id = a.id AND pc.schedule_id = es.id\n          WHERE sg.age_category_id = \${catId} AND sg.session_number = \${sessionNum}\n          ORDER BY sg.group_number, pga.display_order, a.last_name\``
);

fs.writeFileSync(routePath, r);
console.log('groups route patched');

// 2. Patch groups page - add Download and Print icons to imports, add export functions + buttons
const pagePath = 'src/app/association/dashboard/category/[catId]/groups/page.jsx';
let p = fs.readFileSync(pagePath, 'utf8');

// Add Download icon to imports
p = p.replace(
  `  ArrowLeft, Users, Shuffle, Check, AlertCircle,\n  GripVertical, ChevronRight, Copy, ExternalLink, RefreshCw`,
  `  ArrowLeft, Users, Shuffle, Check, AlertCircle,\n  GripVertical, ChevronRight, Copy, ExternalLink, RefreshCw, Download, Printer`
);

// Add export functions after assignments line
p = p.replace(
  `  const sessions = setupData?.sessions || [];\n  const groups = groupsData?.groups || [];\n  const assignments = groupsData?.assignments || [];`,
  `  const sessions = setupData?.sessions || [];
  const groups = groupsData?.groups || [];
  const assignments = groupsData?.assignments || [];
  const currentSession = sessions.find(s => s.session_number === selectedSession);

  const exportCSV = () => {
    const rows = [['Group', 'Date', 'Time', 'Location', 'Last Name', 'First Name', 'ID', 'Position']];
    for (const group of groups) {
      const players = assignments.filter(a => a.session_group_id === group.id);
      const sample = players[0];
      const date = sample?.scheduled_date ? new Date(sample.scheduled_date).toLocaleDateString() : '';
      const time = sample?.start_time && sample?.end_time ? sample.start_time + ' - ' + sample.end_time : (sample?.start_time || '');
      const loc = sample?.location || '';
      for (const player of players) {
        rows.push([
          'Group ' + group.group_number, date, time, loc,
          player.last_name, player.first_name, player.external_id || '', player.position || ''
        ]);
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
    html += 'body{font-family:Arial,sans-serif;padding:20px;color:#111}';
    html += 'h1{font-size:20px;margin-bottom:4px}';
    html += '.subtitle{font-size:13px;color:#555;margin-bottom:24px}';
    html += '.group{margin-bottom:28px;page-break-inside:avoid}';
    html += '.group-header{background:#1A6BFF;color:white;padding:8px 14px;border-radius:6px 6px 0 0;font-size:14px;font-weight:bold}';
    html += '.group-meta{font-size:12px;opacity:0.85;margin-top:2px}';
    html += 'table{width:100%;border-collapse:collapse;font-size:13px}';
    html += 'th{background:#f3f4f6;padding:7px 10px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb}';
    html += 'td{padding:7px 10px;border-bottom:1px solid #f3f4f6}';
    html += 'tr:last-child td{border-bottom:none}';
    html += '@media print{body{padding:10px}.group{page-break-inside:avoid}}';
    html += '</style></head><body>';
    html += '<h1>' + catName + ' \u2014 ' + sessionName + '</h1>';
    html += '<div class="subtitle">Generated ' + new Date().toLocaleDateString() + '</div>';

    for (const group of groups) {
      const players = assignments.filter(a => a.session_group_id === group.id);
      const sample = players[0];
      const date = sample?.scheduled_date ? new Date(sample.scheduled_date).toLocaleDateString('en-CA', {weekday:'long',year:'numeric',month:'long',day:'numeric'}) : '';
      const time = sample?.start_time && sample?.end_time ? sample.start_time + ' \u2013 ' + sample.end_time : (sample?.start_time || '');
      const loc = sample?.location || '';
      html += '<div class="group">';
      html += '<div class="group-header">Group ' + group.group_number;
      if (date || time || loc) html += '<span class="group-meta"> &nbsp;|&nbsp; ' + [date, time, loc].filter(Boolean).join(' &nbsp;\u00b7&nbsp; ') + '</span>';
      html += '</div>';
      html += '<table><thead><tr><th>#</th><th>Last Name</th><th>First Name</th><th>ID</th><th>Position</th></tr></thead><tbody>';
      players.forEach((pl, i) => {
        html += '<tr><td>' + (i+1) + '</td><td>' + pl.last_name + '</td><td>' + pl.first_name + '</td><td>' + (pl.external_id || '\u2014') + '</td><td>' + (pl.position || '\u2014') + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }
    html += '</body></html>';

    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 500);
  };`
);

// Add export buttons to header
p = p.replace(
  `        <div className="flex items-center gap-2 flex-wrap">`,
  `        <div className="flex items-center gap-2 flex-wrap">
            {groups.length > 0 && assignments.length > 0 && (
              <>
                <button onClick={exportCSV} className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50">
                  <Download size={14} /> CSV
                </button>
                <button onClick={exportPrint} className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50">
                  <Printer size={14} /> Print / PDF
                </button>
              </>
            )}`
);

p = p.replace(
  `        </div>\n      </div>\n\n      {message`,
  `          </div>\n        </div>\n      </div>\n\n      {message`
);

fs.writeFileSync(pagePath, p);
console.log('groups page patched');
