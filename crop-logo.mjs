import { createCanvas, loadImage } from 'canvas';
import { writeFileSync } from 'fs';

const img = await loadImage('public/logo-sheet.png');
const W = img.width;
const H = img.height;
const hw = Math.floor(W / 2);
const hh = Math.floor(H / 2);

const crops = [
  { name: 'logo-dark.png',  x: 0,  y: 0,  w: hw, h: hh },
  { name: 'logo-light.png', x: hw, y: 0,  w: hw, h: hh },
  { name: 'icon-dark.png',  x: 0,  y: hh, w: hw, h: hh },
  { name: 'icon-light.png', x: hw, y: hh, w: hw, h: hh },
];

for (const c of crops) {
  const canvas = createCanvas(c.w, c.h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, c.x, c.y, c.w, c.h, 0, 0, c.w, c.h);
  writeFileSync(`public/${c.name}`, canvas.toBuffer('image/png'));
  console.log(`saved public/${c.name}`);
}
