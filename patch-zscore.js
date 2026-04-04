const fs = require('fs');
const path = 'src/app/association/dashboard/category/[catId]/groups/page.jsx';
let lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);

// 1. Add threshold state after promoteN
lines.forEach((l, i) => {
  if (l.includes("const [promoteN, setPromoteN] = useState(3);")) {
    lines.splice(i + 1, 0, "  const [sdThreshold, setSdThreshold] = useState(1.0); // players beyond X std devs from group mean are candidates");
    console.log('added sdThreshold state at line', i+2);
  }
});

// 2. Add rankings useQuery after groupsData query
lines.forEach((l, i) => {
  if (l.includes("queryKey: [\"groups\", catId, selectedSession]")) {
    // Find the end of this query block
    let end = i;
    let braces = 0;
    for (let j = i; j < lines.length; j++) {
      braces += (lines[j].match(/\{/g) || []).length;
      braces -= (lines[j].match(/\}/g) || []).length;
      if (braces <= 0 && j > i) { end = j; break; }
    }
    lines.splice(end + 1, 0,
      '',
      '  const { data: rankingsData } = useQuery({',
      '    queryKey: ["groups-rankings", catId],',
      '    queryFn: async () => { const res = await fetch(`/api/categories/${catId}/rankings`); return res.json(); },',
      '    enabled: !!catId,',
      '  });',
      '  const rankedAthletes = rankingsData?.athletes || [];'
    );
    console.log('added rankings query after line', end+1);
  }
});

// 3. Replace buildPromotePlan with z-score methodology
let buildStart = -1, buildEnd = -1;
lines.forEach((l, i) => {
  if (l.includes('// Build promotion plan - bottom N from each group')) buildStart = i;
  if (buildStart > 0 && buildEnd === -1 && l.includes('setPromotePlan(plan);') && i > buildStart) buildEnd = i;
});

if (buildStart > -1 && buildEnd > -1) {
  const newBuild = [
    '  // Z-score based movement: candidates are players > sdThreshold SDs from their group mean',
    '  const buildPromotePlan = () => {',
    '    const sortedGroups = [...groups].sort((a, b) => a.group_number - b.group_number);',
    '    const plan = [];',
    '    const stats = {}; // per group: mean, sd, scores',
    '',
    '    // Build score map from rankings data',
    '    const scoreMap = {};',
    '    rankedAthletes.forEach(a => { scoreMap[a.id] = a.weighted_total; });',
    '',
    '    // Calculate mean and SD per group',
    '    for (const group of sortedGroups) {',
    '      const players = groupPlayers[group.id] || [];',
    '      const scores = players.map(p => scoreMap[p.athlete_id]).filter(s => s != null);',
    '      if (!scores.length) { stats[group.id] = { mean: 0, sd: 0, scores }; continue; }',
    '      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;',
    '      const sd = Math.sqrt(scores.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / scores.length);',
    '      stats[group.id] = { mean, sd, scores };',
    '    }',
    '',
    '    // Find candidates at each group boundary',
    '    for (let i = 0; i < sortedGroups.length - 1; i++) {',
    '      const upperGroup = sortedGroups[i];',
    '      const lowerGroup = sortedGroups[i + 1];',
    '      const upperStats = stats[upperGroup.id];',
    '      const lowerStats = stats[lowerGroup.id];',
    '      const upperPlayers = groupPlayers[upperGroup.id] || [];',
    '      const lowerPlayers = groupPlayers[lowerGroup.id] || [];',
    '',
    '      // Candidates to move DOWN: bottom of upper group, score < mean - sdThreshold*sd',
    '      const demoteCandidates = upperPlayers',
    '        .map(p => ({ ...p, score: scoreMap[p.athlete_id], zScore: upperStats.sd > 0 ? (scoreMap[p.athlete_id] - upperStats.mean) / upperStats.sd : 0 }))',
    '        .filter(p => p.score != null && p.zScore < -sdThreshold)',
    '        .sort((a, b) => a.zScore - b.zScore) // most negative first',
    '        .slice(0, promoteN);',
    '',
    '      // Candidates to move UP: top of lower group, score > mean + sdThreshold*sd',
    '      const promoteCandidates = lowerPlayers',
    '        .map(p => ({ ...p, score: scoreMap[p.athlete_id], zScore: lowerStats.sd > 0 ? (scoreMap[p.athlete_id] - lowerStats.mean) / lowerStats.sd : 0 }))',
    '        .filter(p => p.score != null && p.zScore > sdThreshold)',
    '        .sort((a, b) => b.zScore - a.zScore) // most positive first',
    '        .slice(0, promoteN);',
    '',
    '      demoteCandidates.forEach(p => plan.push({',
    '        athlete: p, fromGroup: upperGroup, toGroup: lowerGroup, direction: "down",',
    '        score: p.score, zScore: p.zScore, groupMean: upperStats.mean, groupSd: upperStats.sd',
    '      }));',
    '      promoteCandidates.forEach(p => plan.push({',
    '        athlete: p, fromGroup: lowerGroup, toGroup: upperGroup, direction: "up",',
    '        score: p.score, zScore: p.zScore, groupMean: lowerStats.mean, groupSd: lowerStats.sd',
    '      }));',
    '    }',
    '    setPromotePlan(plan);',
    '  };',
  ];
  lines.splice(buildStart, buildEnd - buildStart + 1, ...newBuild);
  console.log('replaced buildPromotePlan with z-score methodology');
}

// 4. Update modal to show SD threshold control and z-score info
lines.forEach((l, i) => {
  if (l.includes("label style={{fontSize:\"13px\",color:\"#555\"}}>Players to move per boundary:</label>")) {
    // Find the end of the controls div
    let end = i + 6;
    lines.splice(i, end - i,
      '              <label style={{fontSize:"13px",color:"#555"}}>Max players per boundary:</label>',
      '              <select value={promoteN} onChange={e => setPromoteN(Number(e.target.value))} style={{padding:"4px 8px",border:"1px solid #e5e7eb",borderRadius:"6px",fontSize:"13px"}}>',
      '                {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}',
      '              </select>',
      '              <label style={{fontSize:"13px",color:"#555",marginLeft:"8px"}}>SD threshold:</label>',
      '              <select value={sdThreshold} onChange={e => setSdThreshold(Number(e.target.value))} style={{padding:"4px 8px",border:"1px solid #e5e7eb",borderRadius:"6px",fontSize:"13px"}}>',
      '                {[0.5,0.75,1.0,1.25,1.5,2.0].map(v => <option key={v} value={v}>{v}σ</option>)}',
      '              </select>',
      '              <button onClick={buildPromotePlan} style={{padding:"4px 10px",background:"#f3f4f6",border:"1px solid #e5e7eb",borderRadius:"6px",fontSize:"12px",cursor:"pointer",marginLeft:"4px"}}>Recalculate</button>'
    );
    console.log('updated modal controls at line', i+1);
  }
});

// 5. Update modal description
lines.forEach((l, i) => {
  if (l.includes('Review and remove any moves you don')) {
    lines[i] = '            <div style={{fontSize:"12px",color:"#888",marginBottom:"16px"}}>Players flagged are statistical outliers in their group — more than {sdThreshold}σ from their group mean. Review and remove any moves before applying.</div>';
    console.log('updated modal description');
  }
});

// 6. Update move card to show score and z-score
lines.forEach((l, i) => {
  if (l.includes('<span style={{fontSize:"12px",color:"#666",marginLeft:"8px"}}>Group {move.fromGroup.group_number}')) {
    lines[i] = lines[i].replace(
      '<span style={{fontSize:"12px",color:"#666",marginLeft:"8px"}}>Group {move.fromGroup.group_number} → Group {move.toGroup.group_number}</span>',
      '<span style={{fontSize:"12px",color:"#666",marginLeft:"8px"}}>Group {move.fromGroup.group_number} → Group {move.toGroup.group_number} · Score: {move.score?.toFixed(1)} · {move.zScore?.toFixed(2)}σ from mean</span>'
    );
    console.log('updated move card score display');
  }
});

// 7. Update empty plan message
lines.forEach((l, i) => {
  if (l.includes('Apply {promotePlan.length} Moves')) {
    lines[i] = lines[i].replace(
      'Apply {promotePlan.length} Moves',
      '{promotePlan.length === 0 ? "No candidates found — try lowering the SD threshold" : `Apply ${promotePlan.length} Move${promotePlan.length !== 1 ? "s" : ""}`}'
    );
    console.log('updated apply button text');
  }
});

fs.writeFileSync(path, lines.join('\n'));
console.log('done');
