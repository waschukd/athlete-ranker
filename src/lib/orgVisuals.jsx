"use client";

// Visual identity helpers for organizations: a deterministic color palette,
// chip, and avatar used everywhere an org needs to be visually identified
// (evaluator dashboard rows, SP admin master schedule, association cards).
//
// All colors are inline hex so Tailwind's purge step doesn't drop them.

import React, { useRef, useState } from "react";
import { Camera, X } from "lucide-react";

// Palette: 10 hues spread maximally around the color wheel so adjacent
// palette indexes stay visually distinct even as background tints. `bg`
// is the chip/avatar background; `fg` is the readable text color on top;
// `hex` is the strong saturated tone used for a row's left border.
export const ORG_PALETTE = [
  { hex: "#2563eb", bg: "#bfdbfe", fg: "#1e3a8a" }, // blue
  { hex: "#dc2626", bg: "#fecaca", fg: "#7f1d1d" }, // red
  { hex: "#16a34a", bg: "#bbf7d0", fg: "#14532d" }, // green
  { hex: "#ea580c", bg: "#fed7aa", fg: "#7c2d12" }, // orange
  { hex: "#9333ea", bg: "#e9d5ff", fg: "#581c87" }, // purple
  { hex: "#ca8a04", bg: "#fef08a", fg: "#713f12" }, // gold
  { hex: "#0891b2", bg: "#a5f3fc", fg: "#164e63" }, // cyan
  { hex: "#db2777", bg: "#fbcfe8", fg: "#831843" }, // pink
  { hex: "#65a30d", bg: "#d9f99d", fg: "#365314" }, // lime
  { hex: "#7c3aed", bg: "#ddd6fe", fg: "#4c1d95" }, // violet
];

// Hash-based fallback when no view-level color map is available.
export function colorForOrg(name) {
  if (!name) return ORG_PALETTE[0];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return ORG_PALETTE[Math.abs(h) % ORG_PALETTE.length];
}

// Position-based assignment: each unique org in the input list gets a
// guaranteed-distinct palette entry by alphabetical position. Wraps once
// the palette is exhausted (>10 distinct orgs in one view).
export function buildOrgColorMap(orgNames) {
  const unique = Array.from(new Set((orgNames || []).filter(Boolean))).sort();
  const map = new Map();
  unique.forEach((name, i) => {
    map.set(name, ORG_PALETTE[i % ORG_PALETTE.length]);
  });
  return map;
}

// Short label for compact chips. "BAHA" -> "BAHA". "Millwoods Minor Hockey
// Association" -> "MMHA". "South East Edmonton Recreational" -> "SEER".
export function abbrevOrgName(name) {
  if (!name) return "?";
  const trimmed = name.trim();
  if (trimmed.length <= 6) return trimmed.toUpperCase();
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const initials = words.map(w => w[0]).join("").toUpperCase();
    if (initials.length >= 3 && initials.length <= 6) return initials;
  }
  return trimmed.slice(0, 6).toUpperCase();
}

// Initials for a square avatar (different rule from chip — usually shorter
// for visual readability inside a circle).
function avatarInitials(name) {
  if (!name) return "?";
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/**
 * OrgChip — small colored badge showing the org's abbreviated name.
 * Used inline in session rows and in arena headers as a legend.
 */
export function OrgChip({ name, palette, className = "", style = {}, title }) {
  const p = palette || colorForOrg(name);
  return (
    <span
      className={`inline-flex items-center justify-center text-[11px] font-bold tracking-wide rounded px-2 py-1 whitespace-nowrap ${className}`}
      style={{ background: p.bg, color: p.fg, ...style }}
      title={title || name || undefined}
    >
      {abbrevOrgName(name)}
    </span>
  );
}

/**
 * OrgAvatar — square colored tile with the org's initials. Used wherever
 * a generic "office building" icon was used for an org. Custom size via prop.
 *
 * If `logoUrl` is supplied, renders the uploaded image instead of initials.
 *
 * If `onUpload(file)` is supplied (admin context), the avatar becomes
 * clickable: a hover overlay invites uploading; clicking opens a file
 * picker; selecting a file calls `onUpload` with the File. While onUpload
 * is in flight, a spinner is shown. If `onRemove` is also supplied AND the
 * org currently has a logo, an "X" badge appears to clear it.
 */
export function OrgAvatar({
  name,
  logoUrl,
  palette,
  size = 40,
  className = "",
  onUpload,
  onRemove,
}) {
  const p = palette || colorForOrg(name);
  const initials = avatarInitials(name);
  const fontSize = Math.round(size * 0.4);
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    if (!file || !onUpload) return;
    setBusy(true);
    setError(null);
    try {
      await onUpload(file);
    } catch (err) {
      setError(err?.message || "Upload failed");
      setTimeout(() => setError(null), 3500);
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (e) => {
    e.stopPropagation();
    if (!onRemove) return;
    setBusy(true);
    try { await onRemove(); } finally { setBusy(false); }
  };

  // Pure display mode — no upload affordance
  if (!onUpload) {
    if (logoUrl) {
      return (
        <img
          src={logoUrl}
          alt={name || "Organization"}
          className={`rounded-lg object-cover ${className}`}
          style={{ width: size, height: size, background: p.bg }}
        />
      );
    }
    return (
      <div
        className={`rounded-lg flex items-center justify-center font-bold flex-shrink-0 ${className}`}
        style={{ width: size, height: size, background: p.bg, color: p.fg, fontSize }}
        aria-label={name || "Organization"}
        title={name || undefined}
      >
        {initials}
      </div>
    );
  }

  // Editable mode — clickable, with hover overlay
  return (
    <div
      className={`relative group flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={name || "Organization"}
          className="rounded-lg object-cover w-full h-full"
          style={{ background: p.bg }}
        />
      ) : (
        <div
          className="rounded-lg flex items-center justify-center font-bold w-full h-full"
          style={{ background: p.bg, color: p.fg, fontSize }}
        >
          {initials}
        </div>
      )}
      {/* Click target + hover affordance */}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="absolute inset-0 rounded-lg flex items-center justify-center bg-black/0 hover:bg-black/40 transition-colors opacity-0 group-hover:opacity-100 disabled:cursor-wait text-white"
        title={logoUrl ? "Replace logo" : "Upload logo"}
        aria-label={logoUrl ? "Replace logo" : "Upload logo"}
      >
        <Camera size={Math.max(14, Math.round(size * 0.35))} />
      </button>
      {/* Always-visible little camera badge so users know it's editable
          even without hovering (desktop hover doesn't exist on touch) */}
      {!busy && !logoUrl && (
        <span
          className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-500 shadow-sm"
          aria-hidden
        >
          <Camera size={10} />
        </span>
      )}
      {/* Remove badge when there's already a logo */}
      {!busy && logoUrl && onRemove && (
        <button
          type="button"
          onClick={handleRemove}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-gray-200 flex items-center justify-center text-red-500 shadow-sm opacity-0 group-hover:opacity-100 hover:bg-red-50"
          title="Remove logo"
          aria-label="Remove logo"
        >
          <X size={11} />
        </button>
      )}
      {busy && (
        <div className="absolute inset-0 rounded-lg bg-black/40 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {error && (
        <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] bg-red-600 text-white px-2 py-0.5 rounded shadow z-10">
          {error}
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        onChange={handleFile}
        className="hidden"
      />
    </div>
  );
}
