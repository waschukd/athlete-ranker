const fs = require('fs');

// 1. Create anchors API route
fs.mkdirSync('src/app/api/categories/[catId]/anchors', { recursive: true });
fs.writeFileSync('src/app/api/categories/[catId]/anchors/route.js', `
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import sql from "@/lib/db";

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;
    const { searchParams } = new URL(request.url);
    const sessionNum = searchParams.get("session");

    const anchors = await sql\`
      SELECT ap.*, a.first_name, a.last_name, a.external_id
      FROM anchor_players ap
      JOIN athletes a ON a.id = ap.athlete_id
      WHERE ap.age_category_id = \${catId}
      \${sessionNum ? sql\`AND ap.session_number = \${sessionNum}\` : sql\`\`}
      ORDER BY ap.session_number, a.last_name
    \`;

    // Calculate correction factors if enough anchors exist
    const category = await sql\`SELECT evaluation_config FROM age_categories WHERE id = \${catId}\`;
    const config = category[0]?.evaluation_config || {};

    return NextResponse.json({ anchors, calibration_enabled: config.anchor_calibration_enabled || false });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;
    const { action, athlete_id, session_number } = await request.json();
    const userRes = await sql\`SELECT id FROM users WHERE email = \${session.email}\`;
    const userId = userRes[0]?.id;

    if (action === "flag") {
      // Max 3 anchors per session
      const existing = await sql\`SELECT COUNT(*) as count FROM anchor_players WHERE age_category_id = \${catId} AND session_number = \${session_number}\`;
      if (parseInt(existing[0].count) >= 3) return NextResponse.json({ error: "Maximum 3 anchor players per session" }, { status: 400 });

      await sql\`
        INSERT INTO anchor_players (age_category_id, athlete_id, session_number, flagged_by)
        VALUES (\${catId}, \${athlete_id}, \${session_number}, \${userId})
        ON CONFLICT (age_category_id, athlete_id, session_number) DO NOTHING
      \`;
      return NextResponse.json({ success: true });
    }

    if (action === "unflag") {
      await sql\`DELETE FROM anchor_players WHERE age_category_id = \${catId} AND athlete_id = \${athlete_id} AND session_number = \${session_number}\`;
      return NextResponse.json({ success: true });
    }

    if (action === "calculate") {
      // Calculate correction factors for each group boundary using anchor scores
      const anchors = await sql\`SELECT * FROM anchor_players WHERE age_category_id = \${catId} AND session_number = \${session_number}\`;
      
      // Get all scores for anchor players in this session
      const corrections = [];
      for (const anchor of anchors) {
        const scores = await sql\`
          SELECT cs.score, sc.name as category_name, 
            sg.group_number,
            AVG(cs.score) OVER (PARTITION BY sg.group_number) as group_avg_for_anchor
          FROM category_scores cs
          JOIN scoring_categories sc ON sc.id = cs.scoring_category_id
          JOIN player_group_assignments pga ON pga.athlete_id = cs.athlete_id
          JOIN session_groups sg ON sg.id = pga.session_group_id AND sg.session_number = cs.session_number
          WHERE cs.athlete_id = \${anchor.athlete_id} AND cs.age_category_id = \${catId} AND cs.session_number = \${session_number}
        \`;
        
        const byGroup = {};
        scores.forEach(s => {
          if (!byGroup[s.group_number]) byGroup[s.group_number] = [];
          byGroup[s.group_number].push(parseFloat(s.score));
        });

        const groupAvgs = {};
        Object.entries(byGroup).forEach(([g, vals]) => {
          groupAvgs[g] = vals.reduce((a, b) => a + b, 0) / vals.length;
        });

        await sql\`
          UPDATE anchor_players SET raw_scores = \${JSON.stringify(groupAvgs)}
          WHERE age_category_id = \${catId} AND athlete_id = \${anchor.athlete_id} AND session_number = \${session_number}
        \`;
        corrections.push({ anchor_id: anchor.id, athlete_id: anchor.athlete_id, groupAvgs });
      }

      // Calculate correction factor per group boundary
      const groups = Object.keys(corrections[0]?.groupAvgs || {}).map(Number).sort();
      const factors = {};
      for (let i = 0; i < groups.length - 1; i++) {
        const g1 = groups[i], g2 = groups[i+1];
        const ratios = corrections
          .filter(c => c.groupAvgs[g1] && c.groupAvgs[g2])
          .map(c => c.groupAvgs[g1] / c.groupAvgs[g2]);
        if (ratios.length) factors[\`\${g1}_\${g2}\`] = ratios.reduce((a, b) => a + b, 0) / ratios.length;
      }

      return NextResponse.json({ success: true, correction_factors: factors, anchor_count: anchors.length });
    }

    if (action === "approve") {
      const { correction_factors } = await request.json().catch(() => ({})) || {};
      // Store approved correction in evaluation_config
      const cat = await sql\`SELECT evaluation_config FROM age_categories WHERE id = \${catId}\`;
      const config = cat[0]?.evaluation_config || {};
      config.approved_corrections = config.approved_corrections || {};
      config.approved_corrections[session_number] = { factors: correction_factors, approved_by: userId, approved_at: new Date().toISOString() };
      await sql\`UPDATE age_categories SET evaluation_config = \${JSON.stringify(config)} WHERE id = \${catId}\`;
      return NextResponse.json({ success: true });
    }

    if (action === "toggle_calibration") {
      const { enabled } = await request.json().catch(() => ({})) || {};
      const cat = await sql\`SELECT evaluation_config FROM age_categories WHERE id = \${catId}\`;
      const config = cat[0]?.evaluation_config || {};
      config.anchor_calibration_enabled = enabled;
      await sql\`UPDATE age_categories SET evaluation_config = \${JSON.stringify(config)} WHERE id = \${catId}\`;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Anchors error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
`);
console.log('anchors API created');

// 2. Patch groups page to show anchor calibration UI
const groupsPath = 'src/app/association/dashboard/category/[catId]/groups/page.jsx';
let g = fs.readFileSync(groupsPath, 'utf8').replace(/\r\n/g, '\n');

// Add anchor state
g = g.replace(
  '  const [promoteN, setPromoteN] = useState(3);',
  `  const [promoteN, setPromoteN] = useState(3);
  const [showAnchorPanel, setShowAnchorPanel] = useState(false);`
);

// Add anchor data query after rankingsData query
g = g.replace(
  '  const rankedAthletes = rankingsData?.athletes || [];',
  `  const rankedAthletes = rankingsData?.athletes || [];

  const { data: anchorData, refetch: refetchAnchors } = useQuery({
    queryKey: ["anchors", catId, selectedSession],
    queryFn: async () => { const res = await fetch(\`/api/categories/\${catId}/anchors?session=\${selectedSession}\`); return res.json(); },
    enabled: !!catId && !!selectedSession,
  });
  const anchors = anchorData?.anchors || [];
  const calibrationEnabled = anchorData?.calibration_enabled || false;
  const anchorIds = new Set(anchors.filter(a => a.session_number === selectedSession).map(a => a.athlete_id));`
);

// Add anchor toggle button to header
g = g.replace(
  '              {groups.length > 1 && (',
  `              {calibrationEnabled && groups.length > 1 && (
                <button onClick={() => setShowAnchorPanel(!showAnchorPanel)} className={\`inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium \${showAnchorPanel ? "bg-amber-100 border-amber-300 text-amber-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}\`}>
                  ⚓ Anchor Players {anchors.filter(a=>a.session_number===selectedSession).length > 0 ? \`(\${anchors.filter(a=>a.session_number===selectedSession).length})\` : ""}
                </button>
              )}
              {groups.length > 1 && (`
);

// Add anchor panel below header, before groups grid
g = g.replace(
  '        {message && (',
  `        {calibrationEnabled && showAnchorPanel && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-amber-900 text-sm">⚓ Anchor Player Calibration</h3>
                <p className="text-xs text-amber-700 mt-0.5">Flag 2-3 players who will skate in adjacent groups this session. Their scores create a calibration bridge to normalize evaluator bias across groups. Max 3 per session.</p>
              </div>
              <button onClick={async () => {
                const res = await fetch(\`/api/categories/\${catId}/anchors\`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ action:"calculate", session_number: selectedSession }) });
                const data = await res.json();
                if (data.success) { showMsg(\`Calibration calculated using \${data.anchor_count} anchor(s)\`, "success"); refetchAnchors(); }
                else showMsg(data.error, "error");
              }} disabled={anchors.filter(a=>a.session_number===selectedSession).length < 2} className="text-xs px-3 py-2 bg-amber-600 text-white rounded-lg font-medium disabled:opacity-40 hover:bg-amber-700">
                Calculate Correction
              </button>
            </div>
            {anchors.filter(a=>a.session_number===selectedSession).length === 0 ? (
              <p className="text-xs text-amber-600 italic">No anchors flagged yet — click "Set Anchor" on a player card below</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {anchors.filter(a=>a.session_number===selectedSession).map(a => (
                  <div key={a.id} className="flex items-center gap-2 bg-white border border-amber-300 rounded-lg px-3 py-1.5">
                    <span className="text-sm font-medium text-gray-900">{a.last_name}, {a.first_name}</span>
                    {a.raw_scores && <span className="text-xs text-amber-600">Groups: {Object.entries(JSON.parse(a.raw_scores||'{}')).map(([g,v])=>\`G\${g}:\${Number(v).toFixed(1)}\`).join(', ')}</span>}
                    <button onClick={async () => {
                      await fetch(\`/api/categories/\${catId}/anchors\`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ action:"unflag", athlete_id: a.athlete_id, session_number: selectedSession }) });
                      refetchAnchors();
                    }} className="text-xs text-red-400 hover:text-red-600">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {message && (`
);

// Add anchor button to each player card
g = g.replace(
  '{player.team_color && (',
  `{calibrationEnabled && showAnchorPanel && (
                              <button onClick={async (e) => {
                                e.stopPropagation();
                                const isAnchor = anchorIds.has(player.athlete_id);
                                await fetch(\`/api/categories/\${catId}/anchors\`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ action: isAnchor ? "unflag" : "flag", athlete_id: player.athlete_id, session_number: selectedSession }) });
                                refetchAnchors();
                              }} className={\`text-xs px-1.5 py-0.5 rounded font-medium \${anchorIds.has(player.athlete_id) ? "bg-amber-400 text-white" : "bg-gray-100 text-gray-500 hover:bg-amber-100 hover:text-amber-700"}\`}>
                                {anchorIds.has(player.athlete_id) ? "⚓" : "anchor"}
                              </button>
                            )}
                            {player.team_color && (`
);

fs.writeFileSync(groupsPath, g);
console.log('groups page patched');

// 3. Patch category setup page to add anchor calibration toggle
const setupPath = 'src/app/association/dashboard/category/[catId]/setup/page.jsx';
let s = fs.readFileSync(setupPath, 'utf8').replace(/\r\n/g, '\n');

// Find position_tagging toggle and add anchor toggle after it
s = s.replace(
  'director_can_edit_scores',
  'anchor_calibration_enabled'
);

// Add anchor calibration field near position tagging in the form
if (s.includes('position_tagging')) {
  s = s.replace(
    /(\{.*?position.tagging.*?\}[\s\S]*?<\/label>[\s\S]*?<\/div>[\s\S]*?<\/div>)/m,
    `$1
            <div className="flex items-center justify-between py-3 border-t border-gray-100">
              <div>
                <div className="font-medium text-gray-900 text-sm">Anchor Player Calibration</div>
                <div className="text-xs text-gray-500 mt-0.5">Allow flagging anchor players to normalize evaluator bias across groups. Must be approved per session.</div>
              </div>
              <button type="button" onClick={() => handleToggle('anchor_calibration_enabled')}
                className={\`relative inline-flex h-6 w-11 items-center rounded-full transition-colors \${form.anchor_calibration_enabled ? 'bg-[#1A6BFF]' : 'bg-gray-200'}\`}>
                <span className={\`inline-block h-4 w-4 transform rounded-full bg-white transition-transform \${form.anchor_calibration_enabled ? 'translate-x-6' : 'translate-x-1'}\`} />
              </button>
            </div>`
  );
}

fs.writeFileSync(setupPath, s);
console.log('setup page patched');

console.log('all done');
