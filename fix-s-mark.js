const fs = require('fs');
const path = 'src/app/account/signin/page.jsx';
let c = fs.readFileSync(path, 'utf8');

c = c.replace(
  `<div style={{width:"56px",height:"56px",background:"#1A6BFF",borderRadius:"14px",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width="34" height="34" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M75 20 L55 20 L25 50 L45 50 L75 20Z" fill="white"/>
                <path d="M25 80 L45 80 L75 50 L55 50 L25 80Z" fill="white"/>
              </svg>
            </div>`,
  `<div style={{width:"56px",height:"56px",background:"#1A6BFF",borderRadius:"14px",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width="34" height="34" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M70 15 Q80 15 80 25 L80 38 Q80 45 73 45 L45 45 Q38 45 38 52 L38 58 Q38 65 45 65 L72 65 L72 55 L85 55 L85 75 Q85 85 75 85 L30 85 Q20 85 20 75 L20 62 Q20 55 27 55 L55 55 Q62 55 62 48 L62 42 Q62 35 55 35 L28 35 L28 45 L15 45 L15 25 Q15 15 25 15 Z" fill="white"/>
              </svg>
            </div>`
);

fs.writeFileSync(path, c);
console.log('done');
