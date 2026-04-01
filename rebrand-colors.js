const fs = require('fs');
const path = require('path');

const replacements = [
  ['#FF6B35', '#1A6BFF'],
  ['#F7931E', '#4D8FFF'],
  ['#E55A2E', '#0F4FCC'],
  ['from-\\[#FF6B35\\]', 'from-[#1A6BFF]'],
  ['to-\\[#F7931E\\]', 'to-[#4D8FFF]'],
  ['ring-\\[#FF6B35\\]', 'ring-[#1A6BFF]'],
  ['text-\\[#FF6B35\\]', 'text-[#1A6BFF]'],
  ['bg-\\[#FF6B35\\]', 'bg-[#1A6BFF]'],
  ['hover:bg-\\[#E55A2E\\]', 'hover:bg-[#0F4FCC]'],
  ['border-\\[#FF6B35\\]', 'border-[#1A6BFF]'],
  ['\\[#FF6B35\\]/10', '[#1A6BFF]/10'],
  ['\\[#FF6B35\\]/20', '[#1A6BFF]/20'],
  ['\\[#FF6B35\\]/30', '[#1A6BFF]/30'],
  ['\\[#FF6B35\\]/50', '[#1A6BFF]/50'],
];

function walk(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const full = path.join(dir, file);
    if (fs.statSync(full).isDirectory()) { walk(full); continue; }
    if (!['.jsx', '.js'].includes(path.extname(file))) continue;
    let content = fs.readFileSync(full, 'utf8');
    let changed = false;
    for (const [from, to] of replacements) {
      const regex = new RegExp(from, 'g');
      const next = content.replace(regex, to);
      if (next !== content) { content = next; changed = true; }
    }
    if (changed) { fs.writeFileSync(full, content); console.log('updated:', full); }
  }
}

walk('src');
console.log('done');
