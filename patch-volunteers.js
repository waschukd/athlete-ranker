const fs = require('fs');

// 1. Create volunteer notify API route
fs.mkdirSync('src/app/api/categories/[catId]/notify-volunteers', { recursive: true });
fs.writeFileSync('src/app/api/categories/[catId]/notify-volunteers/route.js', `
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sendEmail } from "@/lib/email";

export async function POST(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;
    const { emails, sessionNum, entries, categoryName } = await request.json();
    if (!emails?.length) return NextResponse.json({ error: "No emails provided" }, { status: 400 });

    const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

    const groupLines = entries.map(e => {
      const time = e.start_time && e.end_time ? e.start_time + " - " + e.end_time : e.start_time || "";
      const checkinUrl = e.checkin_code ? BASE_URL + "/checkin/" + e.id : null;
      return \`
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-weight:500;">Group \${e.group_number || "-"}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#555;">\${e.scheduled_date?.toString().split("T")[0] || "-"}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#555;">\${time || "-"}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#555;">\${e.location || "-"}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">\${e.checkin_code ? '<code style="background:#f3f4f6;padding:2px 6px;border-radius:4px;font-size:13px;">' + e.checkin_code + '</code>' : "-"}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">\${checkinUrl ? '<a href="' + checkinUrl + '" style="color:#1A6BFF;font-size:13px;">Open Check-in</a>' : "-"}</td>
        </tr>
      \`;
    }).join("");

    const html = \`
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#080E1A;padding:24px 32px;border-radius:12px 12px 0 0;text-align:center;">
          <div style="font-size:20px;font-weight:700;color:#fff;letter-spacing:0.1em;">SIDELINE STAR</div>
        </div>
        <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px;">
          <h2 style="margin:0 0 8px;font-size:18px;color:#111;">You've been assigned as a volunteer</h2>
          <p style="color:#555;font-size:14px;margin:0 0 24px;">You're assigned to check-in duty for <strong>\${categoryName}</strong> — Session \${sessionNum}. Use the links below to access check-in for your group.</p>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead>
              <tr style="background:#f9fafb;">
                <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#888;">Group</th>
                <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#888;">Date</th>
                <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#888;">Time</th>
                <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#888;">Location</th>
                <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#888;">Code</th>
                <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#888;">Link</th>
              </tr>
            </thead>
            <tbody>\${groupLines}</tbody>
          </table>
          <p style="color:#999;font-size:12px;margin:24px 0 0;">No account needed — just click the check-in link for your group when you arrive.</p>
        </div>
      </div>
    \`;

    let sent = 0;
    for (const email of emails) {
      await sendEmail(email.trim(), "Volunteer assignment - " + categoryName + " Session " + sessionNum, html);
      sent++;
    }

    return NextResponse.json({ success: true, sent });
  } catch (error) {
    console.error("Volunteer notify error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
`);
console.log('API route created');

// 2. Patch association category page
const files = [
  'src/app/association/dashboard/category/[catId]/page.jsx',
  'src/app/director/dashboard/page.jsx'
];

for (const file of files) {
  let c = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

  // Add Mail icon to imports if not there
  if (!c.includes('Send')) {
    c = c.replace('ArrowLeft,', 'ArrowLeft, Send,');
  }

  // Add volunteer modal state after existing state declarations
  c = c.replace(
    'const [scoreManagerOpen, setScoreManagerOpen] = useState(null);',
    `const [scoreManagerOpen, setScoreManagerOpen] = useState(null);
  const [volunteerModal, setVolunteerModal] = useState(null); // { sessionNum, entries }
  const [volunteerEmails, setVolunteerEmails] = useState("");
  const [volunteerSending, setVolunteerSending] = useState(false);
  const [volunteerMsg, setVolunteerMsg] = useState("");`
  );

  // Add send volunteer function
  c = c.replace(
    'const loadScoreManager = async',
    `const sendVolunteers = async () => {
    if (!volunteerEmails.trim()) return;
    setVolunteerSending(true);
    const emails = volunteerEmails.split(/[,\n]/).map(e => e.trim()).filter(Boolean);
    const res = await fetch("/api/categories/" + catId + "/notify-volunteers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emails, sessionNum: volunteerModal.sessionNum, entries: volunteerModal.entries, categoryName: category?.name || "" }),
    });
    const data = await res.json();
    setVolunteerMsg(data.success ? "Sent to " + data.sent + " volunteer(s)" : "Error: " + data.error);
    setVolunteerSending(false);
    setTimeout(() => { setVolunteerMsg(""); setVolunteerModal(null); setVolunteerEmails(""); }, 3000);
  };

  const loadScoreManager = async`
  );

  // Add volunteer modal JSX before closing of main return
  c = c.replace(
    '{activeTab === "schedule" && <ManualScoreUpload',
    `{volunteerModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:50,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px"}}>
          <div style={{background:"#fff",borderRadius:"16px",padding:"28px",width:"100%",maxWidth:"480px",boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
            <h3 style={{margin:"0 0 4px",fontSize:"16px",fontWeight:"600",color:"#111"}}>Assign Volunteers — Session {volunteerModal.sessionNum}</h3>
            <p style={{margin:"0 0 16px",fontSize:"13px",color:"#666"}}>Enter email addresses separated by commas or new lines. They'll receive the check-in links for all groups in this session.</p>
            <textarea
              value={volunteerEmails}
              onChange={e => setVolunteerEmails(e.target.value)}
              placeholder={"volunteer1@email.com, volunteer2@email.com"}
              style={{width:"100%",minHeight:"100px",padding:"10px 12px",border:"1px solid #e5e7eb",borderRadius:"8px",fontSize:"13px",fontFamily:"inherit",resize:"vertical",boxSizing:"border-box",outline:"none"}}
            />
            {volunteerMsg && <div style={{marginTop:"8px",fontSize:"13px",color: volunteerMsg.startsWith("Error") ? "#dc2626" : "#16a34a",fontWeight:"500"}}>{volunteerMsg}</div>}
            <div style={{display:"flex",gap:"8px",marginTop:"16px",justifyContent:"flex-end"}}>
              <button onClick={() => { setVolunteerModal(null); setVolunteerEmails(""); setVolunteerMsg(""); }} style={{padding:"8px 16px",border:"1px solid #e5e7eb",borderRadius:"8px",fontSize:"13px",cursor:"pointer",background:"#fff"}}>Cancel</button>
              <button onClick={sendVolunteers} disabled={volunteerSending || !volunteerEmails.trim()} style={{padding:"8px 16px",background:"#1A6BFF",color:"#fff",border:"none",borderRadius:"8px",fontSize:"13px",fontWeight:"500",cursor:"pointer",opacity: volunteerSending ? 0.6 : 1}}>{volunteerSending ? "Sending..." : "Send Invites"}</button>
            </div>
          </div>
        </div>
      )}

        {activeTab === "schedule" && <ManualScoreUpload`
  );

  // Add Assign Volunteers button to each session header in schedule
  c = c.replace(
    '<a href={`/association/dashboard/category/${catId}/groups?org=${orgId}&session=${sessionNum}`} className="text-xs px-3 py-1.5 bg-[#FF6B35]/10 text-[#FF6B35] rounded-lg font-medium hover:bg-[#FF6B35]/20">Manage Groups</a>',
    `<div className="flex items-center gap-2">
                        <button onClick={() => { setVolunteerModal({ sessionNum, entries }); setVolunteerEmails(""); }} className="text-xs px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg font-medium hover:bg-blue-100">Assign Volunteers</button>
                        <a href={\`/association/dashboard/category/\${catId}/groups?org=\${orgId}&session=\${sessionNum}\`} className="text-xs px-3 py-1.5 bg-[#1A6BFF]/10 text-[#1A6BFF] rounded-lg font-medium hover:bg-[#1A6BFF]/20">Manage Groups</a>
                      </div>`
  );

  fs.writeFileSync(file, c);
  console.log('patched:', file);
}
