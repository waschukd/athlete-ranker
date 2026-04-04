const fs = require('fs');
const path = 'src/app/association/dashboard/category/[catId]/setup/page.jsx';
let lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);

// Remove the misplaced anchor block (lines 281-290)
lines.splice(280, 10);
console.log('removed misplaced anchor block');

// Find position_tagging toggle to inject after it
let insertAt = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('position_tagging') && lines[i].includes('translate-x')) {
    // Find the closing </div> of that toggle block
    let depth = 0;
    for (let j = i; j < lines.length; j++) {
      depth += (lines[j].match(/<div/g) || []).length;
      depth -= (lines[j].match(/<\/div>/g) || []).length;
      if (depth <= 0 && j > i) { insertAt = j + 1; break; }
    }
    break;
  }
}

console.log('inserting anchor toggle at line', insertAt + 1);
lines.splice(insertAt, 0,
  '            <div className="flex items-center justify-between py-4 border-t border-gray-100">',
  '              <div>',
  '                <div className="font-medium text-gray-900 text-sm">Anchor Player Calibration</div>',
  '                <div className="text-xs text-gray-500 mt-0.5">Allow flagging anchor players to normalize evaluator bias across groups. Must be approved per session.</div>',
  '              </div>',
  '              <button type="button" onClick={() => handleToggle("anchor_calibration_enabled")}',
  '                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.anchor_calibration_enabled ? "bg-[#1A6BFF]" : "bg-gray-200"}`}>',
  '                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.anchor_calibration_enabled ? "translate-x-6" : "translate-x-1"}`} />',
  '              </button>',
  '            </div>'
);

fs.writeFileSync(path, lines.join('\n'));
console.log('done');
