// Rasterize source SVGs in src/ into all the PNGs Play Store + Android need.
// Run from project root:  node play-store-assets/rasterize.mjs
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'src');
const OUT = join(ROOT, 'out');
const ANDROID_RES = join(ROOT, '..', 'android', 'app', 'src', 'main', 'res');

function ensure(dir) { if (!existsSync(dir)) mkdirSync(dir, { recursive: true }); }

function rasterize(svgPath, width, height, outPath) {
  const svg = readFileSync(svgPath, 'utf8');
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    background: 'rgba(0,0,0,0)',
    font: { loadSystemFonts: true },
  });
  const png = resvg.render().asPng();
  ensure(dirname(outPath));
  writeFileSync(outPath, png);
  console.log(`  wrote ${outPath.replace(ROOT + '\\', '').replace(ROOT + '/', '')} (${width}x${height})`);
}

const iconMaster = join(SRC, 'icon-master.svg');
const iconForeground = join(SRC, 'icon-foreground.svg');
const featureGraphic = join(SRC, 'feature-graphic.svg');

ensure(OUT);

// ── Play Store assets ──────────────────────────────────────────
console.log('Play Store:');
rasterize(iconMaster, 512, 512, join(OUT, 'icon-512.png'));
rasterize(featureGraphic, 1024, 500, join(OUT, 'feature-1024x500.png'));

// ── Android adaptive icon foreground (5 densities) ─────────────
// 108dp foreground canvas. Densities: mdpi=108px, hdpi=162, xhdpi=216, xxhdpi=324, xxxhdpi=432
console.log('Android adaptive foreground:');
const densities = [
  { name: 'mdpi',    size: 108 },
  { name: 'hdpi',    size: 162 },
  { name: 'xhdpi',   size: 216 },
  { name: 'xxhdpi',  size: 324 },
  { name: 'xxxhdpi', size: 432 },
];
for (const d of densities) {
  const dir = join(ANDROID_RES, `mipmap-${d.name}`);
  rasterize(iconForeground, d.size, d.size, join(dir, 'ic_launcher_foreground.png'));
  // Also write a standard square launcher PNG using the master icon (for pre-adaptive Android < 8
  // and for apps that show the raw PNG instead of an adaptive icon).
  rasterize(iconMaster, d.size, d.size, join(dir, 'ic_launcher.png'));
  rasterize(iconMaster, d.size, d.size, join(dir, 'ic_launcher_round.png'));
}

// ── Adaptive icon XML + background color ───────────────────────
const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;
const anyDpi = join(ANDROID_RES, 'mipmap-anydpi-v26');
ensure(anyDpi);
writeFileSync(join(anyDpi, 'ic_launcher.xml'), adaptiveXml);
writeFileSync(join(anyDpi, 'ic_launcher_round.xml'), adaptiveXml);
console.log(`  wrote mipmap-anydpi-v26/ic_launcher.xml (+ _round)`);

// Background color resource
const colorsPath = join(ANDROID_RES, 'values', 'ic_launcher_background.xml');
const colorsXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#060b18</color>
</resources>
`;
writeFileSync(colorsPath, colorsXml);
console.log(`  wrote values/ic_launcher_background.xml (#060b18)`);

console.log('\nDone. Next steps:');
console.log('  1. Commit & push the android/app/src/main/res/ changes (they are gitignored — just rebuild).');
console.log('  2. Run build-release.ps1 to produce app-release.aab with the new icons baked in.');
console.log('  3. Upload play-store-assets/out/icon-512.png and feature-1024x500.png to Play Console.');
