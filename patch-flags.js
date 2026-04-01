const fs = require('fs');
const path = 'src/app/association/dashboard/category/[catId]/page.jsx';
let c = fs.readFileSync(path, 'utf8');

// 3. Add flagsData useQuery in CategoryHub
c = c.replace(
  '  const sessions = setupData?.sessions || [];',
  `  const { data: flagsData } = useQuery({
    queryKey: ["category-flags", catId],
    queryFn: async () => { const res = await fetch(\`/api/categories/\${catId}/flags\`); return res.json(); },
    enabled: !!catId,
    refetchInterval: 60000,
  });

  const sessions = setupData?.sessions || [];`
);

// 4. Add derived flag maps after filteredAthletes
c = c.replace(
  '  const upcomingSchedule = schedule.filter(',
  `  const allFlags = flagsData?.flags || [];
  const unackedFlags = allFlags.filter(f => !f.acknowledged);
  const athleteFlagMap = unackedFlags.reduce((acc, f) => { acc[f.athlete_id] = (acc[f.athlete_id] || 0) + 1; return acc; }, {});
  const sessionFlagMap = unackedFlags.reduce((acc, f) => { acc[f.session_number] = (acc[f.session_number] || 0) + 1; return acc; }, {});

  const upcomingSchedule = schedule.filter(`
);

// 5. Add flag icon next to last name in rankings table
c = c.replace(
  '<td className="px-4 py-3"><a href={`/player/report?athlete=${a.id}&cat=${catId}`} className="text-gray-900 font-semibold hover:text-[#FF6B35]">{a.last_name}</a></td>',
  '<td className="px-4 py-3"><span className="inline-flex items-center gap-1.5"><a href={`/player/report?athlete=${a.id}&cat=${catId}`} className="text-gray-900 font-semibold hover:text-[#FF6B35]">{a.last_name}</a>{athleteFlagMap[a.id] ? <span title={`${athleteFlagMap[a.id]} unreviewed flag(s)`}><AlertTriangle size={12} className="text-amber-500" /></span> : null}</span></td>'
);

// 6. Add flag badge to schedule session headers
c = c.replace(
  '                      <a href={`/association/dashboard/category/${catId}/groups?org=${orgId}&session=${sessionNum}`} className="text-xs px-3 py-1.5 bg-[#FF6B35]/10 text-[#FF6B35] rounded-lg font-medium hover:bg-[#FF6B35]/20">Manage Groups</a>',
  `                      <div className="flex items-center gap-2">
                        {sessionFlagMap[Number(sessionNum)] ? <span className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-amber-50 text-amber-600 border border-amber-200 rounded-lg font-medium"><AlertTriangle size={11} />{sessionFlagMap[Number(sessionNum)]} flag{sessionFlagMap[Number(sessionNum)] !== 1 ? "s" : ""}</span> : null}
                        <a href={\`/association/dashboard/category/\${catId}/groups?org=\${orgId}&session=\${sessionNum}\`} className="text-xs px-3 py-1.5 bg-[#FF6B35]/10 text-[#FF6B35] rounded-lg font-medium hover:bg-[#FF6B35]/20">Manage Groups</a>
                      </div>`
);

// 7. Render FlagsPanel in schedule tab
c = c.replace(
  '        {activeTab === "schedule" && <ManualScoreUpload catId={catId} sessions={sessions} scoringCategories={scoringCategories} />}',
  `        {activeTab === "schedule" && <ManualScoreUpload catId={catId} sessions={sessions} scoringCategories={scoringCategories} />}
        {activeTab === "schedule" && <FlagsPanel catId={catId} />}`
);

fs.writeFileSync(path, c);
console.log('All patches applied.');
