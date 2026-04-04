const fs = require('fs');

const files = [
  'src/app/association/dashboard/category/[catId]/groups/page.jsx',
];

for (const file of files) {
  let c = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

  // 1. Fix grid layout - 1 col mobile, 2 col desktop (no 3 col)
  c = c.replace(
    'className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5"',
    'className="grid grid-cols-1 lg:grid-cols-2 gap-5"'
  );

  // 2. Remove scroll cage - let group cards expand fully
  c = c.replace(
    'className="divide-y divide-gray-50 max-h-80 overflow-y-auto"',
    'className="divide-y divide-gray-50"'
  );

  // 3. Add promote/demote state vars after existing state
  c = c.replace(
    '  const [message, setMessage] = useState(null);',
    `  const [message, setMessage] = useState(null);
  const [promoteN, setPromoteN] = useState(3);
  const [promotePlan, setPromotePlan] = useState(null); // [{from, to, athlete}]`
  );

  // 4. Add buildPromotePlan function before drag handlers
  c = c.replace(
    '  // Drag handlers',
    `  // Build promotion plan - bottom N from each group move down, top N from next group move up
  const buildPromotePlan = () => {
    const sortedGroups = [...groups].sort((a, b) => a.group_number - b.group_number);
    const plan = [];
    for (let i = 0; i < sortedGroups.length - 1; i++) {
      const upperGroup = sortedGroups[i];
      const lowerGroup = sortedGroups[i + 1];
      const upperPlayers = [...(groupPlayers[upperGroup.id] || [])].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
      const lowerPlayers = [...(groupPlayers[lowerGroup.id] || [])].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
      const n = Math.min(promoteN, Math.floor(upperPlayers.length / 2), Math.floor(lowerPlayers.length / 2));
      // Bottom N of upper group move down
      upperPlayers.slice(-n).forEach(p => plan.push({ athlete: p, fromGroup: upperGroup, toGroup: lowerGroup, direction: 'down' }));
      // Top N of lower group move up
      lowerPlayers.slice(0, n).forEach(p => plan.push({ athlete: p, fromGroup: lowerGroup, toGroup: upperGroup, direction: 'up' }));
    }
    setPromotePlan(plan);
  };

  const applyPromotePlan = async () => {
    for (const move of promotePlan) {
      await movePlayer(move.athlete.athlete_id, move.fromGroup.id, move.toGroup.id);
    }
    setPromotePlan(null);
    showMsg('Groups updated with forced movement', 'success');
  };

  // Drag handlers`
  );

  // 5. Add Promote/Demote button to header buttons area
  c = c.replace(
    '              {groups.length > 0 && assignments.length > 0 && (<><button onClick={exportCSV}',
    `              {groups.length > 1 && (
                <button onClick={buildPromotePlan} className="inline-flex items-center gap-1.5 px-3 py-2 bg-purple-50 border border-purple-200 text-purple-700 rounded-lg text-sm font-medium hover:bg-purple-100">
                  ↕ Forced Movement
                </button>
              )}
              {groups.length > 0 && assignments.length > 0 && (<><button onClick={exportCSV}`
  );

  // 6. Add promote modal before closing return
  c = c.replace(
    '{volunteerModal && (',
    `{promotePlan && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:50,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px",overflowY:"auto"}}>
          <div style={{background:"#fff",borderRadius:"16px",padding:"28px",width:"100%",maxWidth:"560px",maxHeight:"80vh",overflowY:"auto"}}>
            <h3 style={{margin:"0 0 4px",fontSize:"16px",fontWeight:"600"}}>Forced Movement Preview</h3>
            <div style={{display:"flex",alignItems:"center",gap:"8px",margin:"12px 0"}}>
              <label style={{fontSize:"13px",color:"#555"}}>Players to move per boundary:</label>
              <select value={promoteN} onChange={e => { setPromoteN(Number(e.target.value)); }} style={{padding:"4px 8px",border:"1px solid #e5e7eb",borderRadius:"6px",fontSize:"13px"}}>
                {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <button onClick={buildPromotePlan} style={{padding:"4px 10px",background:"#f3f4f6",border:"1px solid #e5e7eb",borderRadius:"6px",fontSize:"12px",cursor:"pointer"}}>Recalculate</button>
            </div>
            <div style={{fontSize:"12px",color:"#888",marginBottom:"16px"}}>Review and remove any moves you don't want before applying.</div>
            <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
              {promotePlan.map((move, i) => (
                <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:move.direction==="up"?"#f0fdf4":"#fff7ed",border:"1px solid",borderColor:move.direction==="up"?"#bbf7d0":"#fed7aa",borderRadius:"10px"}}>
                  <div>
                    <span style={{fontWeight:"500",fontSize:"13px"}}>{move.athlete.last_name}, {move.athlete.first_name}</span>
                    <span style={{fontSize:"12px",color:"#666",marginLeft:"8px"}}>Group {move.fromGroup.group_number} → Group {move.toGroup.group_number}</span>
                    <span style={{fontSize:"11px",marginLeft:"6px"}}>{move.direction === "up" ? "⬆ promoted" : "⬇ demoted"}</span>
                  </div>
                  <button onClick={() => setPromotePlan(prev => prev.filter((_, j) => j !== i))} style={{fontSize:"11px",color:"#ef4444",background:"none",border:"none",cursor:"pointer",padding:"2px 6px"}}>Remove</button>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:"8px",marginTop:"20px",justifyContent:"flex-end"}}>
              <button onClick={() => setPromotePlan(null)} style={{padding:"8px 16px",border:"1px solid #e5e7eb",borderRadius:"8px",fontSize:"13px",cursor:"pointer",background:"#fff"}}>Cancel</button>
              <button onClick={applyPromotePlan} style={{padding:"8px 16px",background:"#7C3AED",color:"#fff",border:"none",borderRadius:"8px",fontSize:"13px",fontWeight:"500",cursor:"pointer"}}>Apply {promotePlan.length} Moves</button>
            </div>
          </div>
        </div>
      )}

      {volunteerModal && (`
  );

  fs.writeFileSync(file, c);
  console.log('patched:', file);
}
