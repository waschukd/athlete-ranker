const fs = require('fs');
const path = require('path');
const filePath = path.join('src','app','association','dashboard','category','[catId]','groups','page.jsx');
let content = fs.readFileSync(filePath,'utf8').replace(/\r\n/g,'\n');
const lines = content.split('\n');
const idx = lines.findIndex(l => l.includes('Forced Movement') || l.includes('buildPromotePlan') || l.includes('promotePlan'));
lines.slice(Math.max(0,idx-2), idx+4).forEach((l,i) => console.log((idx-1+i) + ': ' + l));
