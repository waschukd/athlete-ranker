const fs = require('fs');
const path = 'src/app/association/dashboard/category/[catId]/groups/page.jsx';
let lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);

// Fix the broken groupsData query and rankings query
lines.splice(45, 16,
  '  const { data: groupsData, isLoading: groupsLoading, refetch } = useQuery({',
  '    queryKey: ["groups", catId, selectedSession],',
  '    queryFn: async () => {',
  '      const res = await fetch(`/api/categories/${catId}/groups?session=${selectedSession}`);',
  '      return res.json();',
  '    },',
  '    enabled: !!selectedSession,',
  '    refetchInterval: 15000,',
  '  });',
  '',
  '  const { data: rankingsData } = useQuery({',
  '    queryKey: ["groups-rankings", catId],',
  '    queryFn: async () => { const res = await fetch(`/api/categories/${catId}/rankings`); return res.json(); },',
  '    enabled: !!catId,',
  '  });',
  '  const rankedAthletes = rankingsData?.athletes || [];'
);

fs.writeFileSync(path, lines.join('\n'));
console.log('done');
