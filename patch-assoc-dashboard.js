const fs = require('fs');
const path = 'src/app/association/dashboard/page.jsx';
let c = fs.readFileSync(path, 'utf8');

// Pull service_provider from org query result
c = c.replace(
  `  const org = orgData?.organization;`,
  `  const org = orgData?.organization;
  const serviceProvider = orgData?.service_provider || null;`
);

// Wrap join codes and pending approvals sections with SP check
c = c.replace(
  `                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">`,
  `                {!serviceProvider && <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">`
);

// Find the closing div of that grid and add conditional close
c = c.replace(
  `                </div>\n\n                {/* Age Categories */}`,
  `                </div>}\n\n                {serviceProvider && <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 mb-8 flex items-center gap-3"><div className="text-blue-600 font-semibold text-sm">Evaluators managed by {serviceProvider.sp_name}</div><div className="text-xs text-blue-400">Evaluator pool and approvals are handled through your service provider</div></div>}\n\n                {/* Age Categories */}`
);

fs.writeFileSync(path, c);
console.log('done');
