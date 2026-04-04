const fs = require('fs');

// 1. Association dashboard - add LogOut import and sign out button
let p = fs.readFileSync('src/app/association/dashboard/page.jsx', 'utf8').replace(/\r\n/g, '\n');
p = p.replace(
  'import { Users, Calendar, Trophy, Plus, ChevronRight, Zap, Copy, Check, ArrowLeft, Trash2, Mail, X, ExternalLink } from "lucide-react";',
  'import { Users, Calendar, Trophy, Plus, ChevronRight, Zap, Copy, Check, ArrowLeft, Trash2, Mail, X, ExternalLink, LogOut } from "lucide-react";'
);
p = p.replace(
  '      <div className="bg-white border-b border-gray-200 shadow-sm">',
  `      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex justify-end">
          <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/account/signin"; }}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 py-1">
            <LogOut size={14} /> Sign out
          </button>
        </div>`
);
fs.writeFileSync('src/app/association/dashboard/page.jsx', p);
console.log('association dashboard done');

// 2. Association category page - wire up the LogOut that's already imported
let c = fs.readFileSync('src/app/association/dashboard/category/[catId]/page.jsx', 'utf8').replace(/\r\n/g, '\n');
// Find the header/nav area and add sign out
c = c.replace(
  '<button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = orgParam ? "/admin/god-mode" : "/account/signin"; }} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">',
  '<button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/account/signin"; }} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">'
);
// If no logout button exists, find the header and add one
if (!c.includes('Sign out') && !c.includes('sign out')) {
  c = c.replace(
    '<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">',
    `<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex justify-end border-b border-gray-100">
          <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/account/signin"; }}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
            <LogOut size={14} /> Sign out
          </button>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">`
  );
}
fs.writeFileSync('src/app/association/dashboard/category/[catId]/page.jsx', c);
console.log('association category done');

// 3. God mode - add sign out next to SUPER ADMIN badge
let g = fs.readFileSync('src/app/admin/god-mode/page.jsx', 'utf8').replace(/\r\n/g, '\n');
g = g.replace(
  '<span style={{ color: "#FF6B35", fontSize: 10, fontWeight: 600, letterSpacing: "0.8px" }}>SUPER ADMIN</span>\n            </div>',
  `<span style={{ color: "#FF6B35", fontSize: 10, fontWeight: 600, letterSpacing: "0.8px" }}>SUPER ADMIN</span>
            </div>
            <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/account/signin"; }}
              style={{ display:"flex", alignItems:"center", gap:5, fontSize:12, color:"var(--gm-dim)", cursor:"pointer", background:"none", border:"none", padding:"4px 8px", borderRadius:6 }}
              onMouseOver={e=>e.currentTarget.style.color="var(--gm-text)"} onMouseOut={e=>e.currentTarget.style.color="var(--gm-dim)"}>
              &#x2192; Sign out
            </button>`
);
fs.writeFileSync('src/app/admin/god-mode/page.jsx', g);
console.log('god mode done');
