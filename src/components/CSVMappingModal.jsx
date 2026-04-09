"use client";
import { useState } from "react";

const FIELDS = [
  { key: 'first_name', label: 'First Name', required: true, guesses: ['first name', 'first_name', 'firstname', 'first', 'fname', 'given name'] },
  { key: 'last_name', label: 'Last Name', required: true, guesses: ['last name', 'last_name', 'lastname', 'last', 'lname', 'surname', 'family name'] },
  { key: 'external_id', label: 'HC# / Player ID', required: false, guesses: ['hc#', 'hc', 'external_id', 'player id', 'player_id', 'id', 'hcn', 'hockey canada #'] },
  { key: 'position', label: 'Position', required: false, guesses: ['position', 'pos'] },
  { key: 'birth_year', label: 'Birth Year', required: false, guesses: ['birth year', 'birth_year', 'dob', 'birthyear', 'year', 'birth yr'] },
  { key: 'parent_email', label: 'Parent Email', required: false, guesses: ['parent email', 'parent_email', 'email'] },
];

export default function CSVMappingModal({ headers, onConfirm, onCancel }) {
  const autoMap = () => {
    const map = {};
    const lh = headers.map(h => h.toLowerCase().trim());
    for (const f of FIELDS) { const i = lh.findIndex(h => f.guesses.includes(h)); map[f.key] = i >= 0 ? headers[i] : ''; }
    return map;
  };
  const [mapping, setMapping] = useState(autoMap);
  const ok = FIELDS.filter(f => f.required).every(f => mapping[f.key]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">Map CSV Columns</h3>
          <p className="text-sm text-gray-500 mt-1">Detected {headers.length} column{headers.length !== 1 ? 's' : ''} — match them to the expected fields. We've auto-guessed where possible.</p>
        </div>
        <div className="px-6 py-4 space-y-3">
          {FIELDS.map(f => (
            <div key={f.key} className="flex items-center gap-3">
              <div className="w-36 flex-shrink-0">
                <span className="text-sm font-medium text-gray-800">{f.label}</span>
                {f.required ? <span className="text-red-400 ml-1 text-xs">required</span> : <span className="text-gray-400 ml-1 text-xs">optional</span>}
              </div>
              <select value={mapping[f.key]} onChange={e => setMapping(m => ({ ...m, [f.key]: e.target.value }))}
                className={`flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF] bg-white ${f.required && !mapping[f.key] ? 'border-red-300 bg-red-50' : mapping[f.key] ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}>
                <option value="">— Skip —</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <p className="text-xs text-gray-400">* Required fields must be mapped to proceed</p>
          <div className="flex gap-3">
            <button onClick={onCancel} className="px-4 py-2 border border-gray-300 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-100">Cancel</button>
            <button onClick={() => onConfirm(mapping)} disabled={!ok} className="px-5 py-2 bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] text-white rounded-xl text-sm font-semibold disabled:opacity-50">Import Athletes</button>
          </div>
        </div>
      </div>
    </div>
  );
}
