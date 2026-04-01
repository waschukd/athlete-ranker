const fs = require('fs');
const path = 'src/app/evaluator/score/[scheduleId]/page.jsx';
let c = fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

c = c.replace(
  '  const parseVoice = useCallback((text) => {\n    const t = text.trim().toLowerCase();',
  `  const parseVoice = useCallback((text) => {
    const wordNums = {
      'zero':'0','one':'1','two':'2','three':'3','four':'4','five':'5',
      'six':'6','seven':'7','eight':'8','nine':'9','ten':'10',
      'to':'2','too':'2','for':'4','won':'1','ate':'8','nein':'9','tu':'2','fore':'4'
    };
    const normalized = text.trim().toLowerCase().replace(/\\b(zero|one|two|to|too|tu|three|four|for|fore|five|six|seven|eight|ate|nine|nein|ten|won)\\b/gi, m => wordNums[m.toLowerCase()] || m);
    const t = normalized.trim().toLowerCase();`
);

// Also update the setVoiceStatus to show original text not normalized
c = c.replace(
  "    setVoiceStatus(`\"${text}\"`);",
  "    setVoiceStatus(`\"${text}\"${normalized !== text.trim().toLowerCase() ? ' → ' + normalized : ''}`);"
);

fs.writeFileSync(path, c);
console.log('done');
