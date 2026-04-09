"use client";
import { useState } from "react";
import { Copy, Check } from "lucide-react";

export default function CopyCode({ code, scheduleId }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs font-bold text-gray-800 bg-gray-100 px-2 py-1 rounded tracking-wider">{code}</span>
      <button onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
        className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors">
        {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
      </button>
      {scheduleId && <a href={`/checkin/${scheduleId}`} target="_blank" className="text-xs text-[#1A6BFF] hover:underline">Open</a>}
    </div>
  );
}
