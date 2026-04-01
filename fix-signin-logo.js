const fs = require('fs');
const path = 'src/app/account/signin/page.jsx';
let c = fs.readFileSync(path, 'utf8');

c = c.replace(
  `<img src="/logo-dark.png" alt="Sideline Star" className="mx-auto mb-6" style={{height:"80px",objectFit:"contain"}} />`,
  `<img src="/icon-dark.png" alt="Sideline Star" className="mx-auto mb-4" style={{height:"72px",width:"72px",objectFit:"contain"}} />
          <p className="text-lg font-light tracking-widest mb-2" style={{color:"#4D8FFF",letterSpacing:"0.15em"}}>SIDELINE STAR</p>`
);

fs.writeFileSync(path, c);
console.log('done');
