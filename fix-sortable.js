const fs = require('fs');
const files = [
  'src/app/association/dashboard/category/[catId]/page.jsx',
  'src/app/director/dashboard/page.jsx'
];

for (const file of files) {
  let lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

  // Add sort state after positionFilter state
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("useState(\"all\")") && lines[i].includes("positionFilter")) {
      lines.splice(i + 1, 0, '  const [sortBy, setSortBy] = useState(null); // { key, dir }');
      console.log('added sort state in', file);
      break;
    }
  }

  // Add sorted athletes after filteredAthletes
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('const filteredAthletes =') && lines[i].includes('positionFilter')) {
      lines.splice(i + 1, 0,
        `  const sortedAthletes = sortBy ? [...filteredAthletes].sort((a, b) => {`,
        `    const dir = sortBy.dir === 'asc' ? 1 : -1;`,
        `    if (sortBy.key === 'total') return dir * ((a.weighted_total || 0) - (b.weighted_total || 0));`,
        `    if (sortBy.key === 'rank') return dir * (a.rank - b.rank);`,
        `    const aScore = a.session_scores?.[sortBy.key]?.normalized_score ?? -1;`,
        `    const bScore = b.session_scores?.[sortBy.key]?.normalized_score ?? -1;`,
        `    return dir * (aScore - bScore);`,
        `  }) : filteredAthletes;`,
        `  const toggleSort = (key) => setSortBy(prev => prev?.key === key ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' });`,
        `  const sortIcon = (key) => sortBy?.key === key ? (sortBy.dir === 'desc' ? ' ↓' : ' ↑') : ' ↕';`
      );
      console.log('added sort logic in', file);
      break;
    }
  }

  // Replace filteredAthletes.map with sortedAthletes.map in the table body
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('filteredAthletes.map(a =>') && lines[i].includes('hover:bg-gray-50')) {
      lines[i] = lines[i].replace('filteredAthletes.map(a =>', 'sortedAthletes.map(a =>');
      console.log('replaced map in', file, 'at line', i+1);
      break;
    }
  }

  // Replace static headers with sortable ones
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-12">Rank</th>')) {
      lines[i] = lines[i].replace(
        '<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-12">Rank</th>',
        '<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-12 cursor-pointer hover:text-gray-800 select-none" onClick={() => toggleSort(\'rank\')}>Rank{sortIcon(\'rank\')}</th>'
      );
      console.log('made Rank sortable in', file);
    }
    if (lines[i].includes('{sessions.map(s => <th key={s.session_number} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">S{s.session_number}')) {
      lines[i] = lines[i].replace(
        '{sessions.map(s => <th key={s.session_number} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">S{s.session_number}<span className="block text-gray-400 font-normal normal-case">{s.weight_percentage}%</span></th>)}',
        '{sessions.map(s => <th key={s.session_number} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-800 select-none" onClick={() => toggleSort(s.session_number)}>S{s.session_number}{sortIcon(s.session_number)}<span className="block text-gray-400 font-normal normal-case">{s.weight_percentage}%</span></th>)}'
      );
      console.log('made session cols sortable in', file);
    }
    if (lines[i].includes('{hasScores && <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Total</th>}')) {
      lines[i] = lines[i].replace(
        '{hasScores && <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Total</th>}',
        '{hasScores && <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-800 select-none" onClick={() => toggleSort(\'total\')}>Total{sortIcon(\'total\')}</th>}'
      );
      console.log('made Total sortable in', file);
    }
  }

  fs.writeFileSync(file, lines.join('\n'));
}
