const fs = require('fs');
const path = 'src/lib/brand.js';
let c = fs.readFileSync(path, 'utf8');

c = c.replace(
  `  return { primary: "#FF6B35", light: "#fff7f4", dark: "#E55A2E", logo_url: null };`,
  `  return { primary: "#1A6BFF", light: "#E6F1FB", dark: "#0F4FCC", logo_url: null };`
);

fs.writeFileSync(path, c);
console.log('brand.js updated');
