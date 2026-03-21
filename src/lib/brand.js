/**
 * Brand color extraction - no external dependencies
 * Color is extracted client-side and sent with the upload
 */

export function defaultBrand() {
  return { primary: "#FF6B35", light: "#fff7f4", dark: "#E55A2E", logo_url: null };
}

export function lightenColor(hex, amount) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const toHex = v => Math.min(255, Math.round(v + (255 - v) * amount)).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function darkenColor(hex, amount) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const toHex = v => Math.round(v * (1 - amount)).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export async function getOrgBrand(orgId, sql) {
  if (!orgId) return defaultBrand();
  try {
    const org = await sql`SELECT brand_color, brand_color_light, logo_url FROM organizations WHERE id = ${orgId}`;
    if (!org.length || !org[0].brand_color) return defaultBrand();
    return {
      primary: org[0].brand_color,
      light: org[0].brand_color_light || lightenColor(org[0].brand_color, 0.92),
      dark: darkenColor(org[0].brand_color, 0.15),
      logo_url: org[0].logo_url || null,
    };
  } catch (e) {
    return defaultBrand();
  }
}
