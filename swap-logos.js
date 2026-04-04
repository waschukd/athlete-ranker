const fs = require('fs');
const path = require('path');

const FAKE_S_MARK = `<svg width="22" height="22" viewBox="0 0 100 100" fill="none"><path d="M70 15 Q80 15 80 25 L80 38 Q80 45 73 45 L45 45 Q38 45 38 52 L38 58 Q38 65 45 65 L72 65 L72 55 L85 55 L85 75 Q85 85 75 85 L30 85 Q20 85 20 75 L20 62 Q20 55 27 55 L55 55 Q62 55 62 48 L62 42 Q62 35 55 35 L28 35 L28 45 L15 45 L15 25 Q15 15 25 15 Z" fill="white"/></svg>`;
const REAL_S_MARK = `<img src="/s-mark.svg" style={{width:"22px",height:"22px",objectFit:"contain"}} />`;

const FAKE_TILE = `<div style={{width:"36px",height:"36px",background:"#1A6BFF",borderRadius:"9px",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              ${FAKE_S_MARK}
            </div>`;
const REAL_TILE = `<img src="/s-mark-dark.svg" style={{width:"36px",height:"36px",objectFit:"contain",flexShrink:0}} />`;

// Also fix signin page icon
const SIGNIN_FAKE = `<div style={{width:"56px",height:"56px",background:"#1A6BFF",borderRadius:"14px",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width="34" height="34" viewBox="0 0 100 100" fill="none"><path d="M70 15 Q80 15 80 25 L80 38 Q80 45 73 45 L45 45 Q38 45 38 52 L38 58 Q38 65 45 65 L72 65 L72 55 L85 55 L85 75 Q85 85 75 85 L30 85 Q20 85 20 75 L20 62 Q20 55 27 55 L55 55 Q62 55 62 48 L62 42 Q62 35 55 35 L28 35 L28 45 L15 45 L15 25 Q15 15 25 15 Z" fill="white"/></svg>
            </div>`;
const SIGNIN_REAL = `<img src="/s-mark-dark.svg" style={{width:"72px",height:"72px",objectFit:"contain",margin:"0 auto"}} />`;

function walk(dir) {
  for (const file of fs.readdirSync(dir)) {
    const full = path.join(dir, file);
    if (fs.statSync(full).isDirectory()) { walk(full); continue; }
    if (!['.jsx', '.js'].includes(path.extname(file))) continue;
    let c = fs.readFileSync(full, 'utf8');
    let changed = false;

    if (c.includes(FAKE_TILE)) {
      c = c.split(FAKE_TILE).join(REAL_TILE);
      changed = true;
    }
    if (c.includes(SIGNIN_FAKE)) {
      c = c.split(SIGNIN_FAKE).join(SIGNIN_REAL);
      changed = true;
    }

    // Fix landing page logo
    if (c.includes('landing') || full.includes('landing')) {
      c = c.replace(
        /<div className="w-8 h-8[^"]*">[^<]*<Zap[^/]*\/>[^<]*<\/div>/g,
        '<img src="/s-mark-dark.svg" style={{width:"32px",height:"32px",objectFit:"contain"}} />'
      );
    }

    if (changed) { fs.writeFileSync(full, c); console.log('updated:', full); }
  }
}

walk('src');
console.log('done');
