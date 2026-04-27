"use client";

// Visual identity helpers for organizations: a deterministic color palette,
// chip, and avatar used everywhere an org needs to be visually identified
// (evaluator dashboard rows, SP admin master schedule, association cards).
//
// All colors are inline hex so Tailwind's purge step doesn't drop them.

import React from "react";

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
 * a generic "office building" icon was used for an org (e.g. association
 * cards on the SP admin dashboard). Custom size via prop.
 *
 * If `logoUrl` is supplied, renders the uploaded image instead.
 */
export function OrgAvatar({ name, logoUrl, palette, size = 40, className = "" }) {
  const p = palette || colorForOrg(name);
  const initials = avatarInitials(name);
  const fontSize = Math.round(size * 0.4);
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
      style={{
        width: size,
        height: size,
        background: p.bg,
        color: p.fg,
        fontSize,
      }}
      aria-label={name || "Organization"}
      title={name || undefined}
    >
      {initials}
    </div>
  );
}
