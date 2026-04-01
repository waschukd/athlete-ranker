const fs = require('fs');
const path = 'src/app/account/signin/page.jsx';
let c = fs.readFileSync(path, 'utf8');

c = c.replace(
  `<img src="/icon-dark.png" alt="Sideline Star" className="mx-auto mb-4" style={{height:"72px",width:"72px",objectFit:"contain"}} />
          <p className="text-lg font-light tracking-widest mb-2" style={{color:"#4D8FFF",letterSpacing:"0.15em"}}>SIDELINE STAR</p>`,
  `<div className="mx-auto mb-5 flex flex-col items-center gap-3">
            <div style={{width:"56px",height:"56px",background:"#1A6BFF",borderRadius:"14px",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width="34" height="34" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M75 20 L55 20 L25 50 L45 50 L75 20Z" fill="white"/>
                <path d="M25 80 L45 80 L75 50 L55 50 L25 80Z" fill="white"/>
              </svg>
            </div>
            <p style={{color:"#E8F0FF",fontSize:"15px",fontWeight:"300",letterSpacing:"0.2em"}}>SIDELINE STAR</p>
          </div>`
);

fs.writeFileSync(path, c);
console.log('done');
