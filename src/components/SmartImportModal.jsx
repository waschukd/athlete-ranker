
"use client";
import { useState } from "react";

const ATHLETE_FIELDS = [
  { key: "first_name", label: "First Name", required: true },
  { key: "last_name", label: "Last Name", required: true },
  { key: "external_id", label: "Jersey / ID #", required: false },
  { key: "position", label: "Position", required: false },
  { key: "birth_year", label: "Birth Year", required: false },
];

const SCHEDULE_FIELDS = [
  { key: "session_number", label: "Session #", required: true },
  { key: "scheduled_date", label: "Date", required: true },
  { key: "group_number", label: "Group #", required: false },
  { key: "start_time", label: "Start Time", required: false },
  { key: "end_time", label: "End Time", required: false },
  { key: "location", label: "Location", required: false },
  { key: "evaluators_required", label: "Evaluators Required", required: false },
];

// Common field name aliases from TeamSnap, TeamLinkt, HockeyTech etc.
const ALIASES = {
  first_name: ["first", "first_name", "firstname", "given_name", "givenname", "player_first", "fname", "first name", "given name"],
  last_name: ["last", "last_name", "lastname", "surname", "family_name", "player_last", "lname", "last name", "family name"],
  external_id: ["hc#", "hc", "jersey", "jersey_number", "jersey #", "number", "#", "player_number", "id", "external_id", "player id", "player#"],
  position: ["position", "pos", "player_position", "role"],
  birth_year: ["birth_year", "dob", "birthdate", "birth_date", "date_of_birth", "born", "year", "birth year", "date of birth"],
  session_number: ["session", "session_number", "session #", "session#", "ice #", "ice_number"],
  scheduled_date: ["date", "scheduled_date", "game_date", "event_date", "ice_date", "scheduled date"],
  group_number: ["group", "group_number", "group #", "group#", "division"],
  start_time: ["start", "start_time", "time", "start time", "ice_time"],
  end_time: ["end", "end_time", "end time", "finish"],
  location: ["location", "rink", "arena", "venue", "facility", "ice_surface"],
  evaluators_required: ["evaluators", "evaluators_required", "scouts", "required"],
};

function autoDetect(headers) {
  const mapping = {};
  const normalizedHeaders = headers.map(h => h.toLowerCase().trim().replace(/[^a-z0-9#]/g, "_"));
  for (const [field, aliases] of Object.entries(ALIASES)) {
    for (let i = 0; i < normalizedHeaders.length; i++) {
      const h = normalizedHeaders[i];
      const raw = headers[i].toLowerCase().trim();
      if (aliases.includes(h) || aliases.includes(raw)) {
        if (!mapping[field]) mapping[field] = headers[i];
        break;
      }
    }
  }
  return mapping;
}

export default function SmartImportModal({ type, headers, preview, onConfirm, onClose }) {
  const fields = type === "athletes" ? ATHLETE_FIELDS : SCHEDULE_FIELDS;
  const [mapping, setMapping] = useState(() => autoDetect(headers));

  const requiredMapped = fields.filter(f => f.required).every(f => mapping[f.key]);

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px"}}>
      <div style={{background:"#fff",borderRadius:"16px",padding:"28px",width:"100%",maxWidth:"680px",maxHeight:"90vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
        <h3 style={{margin:"0 0 4px",fontSize:"16px",fontWeight:"600",color:"#111"}}>Map your columns</h3>
        <p style={{margin:"0 0 20px",fontSize:"13px",color:"#666"}}>
          We detected {headers.length} columns from your file. Match them to Sideline Star fields below — we've pre-filled what we could detect automatically.
        </p>

        {/* Preview */}
        <div style={{marginBottom:"20px",overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:"12px"}}>
            <thead>
              <tr>{headers.map(h => <th key={h} style={{padding:"6px 10px",background:"#f9fafb",border:"1px solid #e5e7eb",textAlign:"left",fontWeight:"500",color:"#555",whiteSpace:"nowrap"}}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {preview.map((row, i) => (
                <tr key={i}>{headers.map(h => <td key={h} style={{padding:"6px 10px",border:"1px solid #e5e7eb",color:"#333",whiteSpace:"nowrap"}}>{row[h] || ""}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mapping */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"20px"}}>
          {fields.map(field => (
            <div key={field.key} style={{display:"flex",alignItems:"center",gap:"8px",padding:"10px 12px",background:mapping[field.key]?"#f0f9ff":"#fafafa",border:"1px solid",borderColor:mapping[field.key]?"#bae6fd":"#e5e7eb",borderRadius:"8px"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:"12px",fontWeight:"500",color:"#111"}}>
                  {field.label} {field.required && <span style={{color:"#ef4444"}}>*</span>}
                </div>
                <select
                  value={mapping[field.key] || ""}
                  onChange={e => setMapping(prev => ({ ...prev, [field.key]: e.target.value || undefined }))}
                  style={{width:"100%",marginTop:"4px",padding:"4px 6px",border:"1px solid #e5e7eb",borderRadius:"6px",fontSize:"12px",background:"#fff"}}
                >
                  <option value="">— skip —</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              {mapping[field.key] && <span style={{fontSize:"16px"}}>✓</span>}
            </div>
          ))}
        </div>

        {!requiredMapped && (
          <div style={{marginBottom:"16px",padding:"10px 14px",background:"#fef2f2",border:"1px solid #fecaca",borderRadius:"8px",fontSize:"12px",color:"#dc2626"}}>
            Please map all required fields (*) before importing.
          </div>
        )}

        <div style={{display:"flex",gap:"8px",justifyContent:"flex-end"}}>
          <button onClick={onClose} style={{padding:"8px 16px",border:"1px solid #e5e7eb",borderRadius:"8px",fontSize:"13px",cursor:"pointer",background:"#fff"}}>Cancel</button>
          <button
            onClick={() => onConfirm(mapping)}
            disabled={!requiredMapped}
            style={{padding:"8px 20px",background:requiredMapped?"#1A6BFF":"#9ca3af",color:"#fff",border:"none",borderRadius:"8px",fontSize:"13px",fontWeight:"500",cursor:requiredMapped?"pointer":"not-allowed"}}
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
