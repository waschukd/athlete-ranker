const fs = require('fs');
const path = 'src/app/api/categories/[catId]/rankings/route.js';
let c = fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

c = c.replace(
  `      const partials = athletes.map(a => {
        const athleteScores = scoreMap[a.id] || {};
        let partialTotal = 0;
        for (const session of relevantSessions) {
          const sd = athleteScores[session.session_number];
          if (sd && totalWeight > 0) {
            partialTotal += sd.normalized_score * (parseFloat(session.weight_percentage) / totalWeight);
          }
        }
        return { id: a.id, partialTotal };
      });`,
  `      const isAllSessions = sessionsUpTo.length === completedSessions.length && completedSessions.length === sessions.length;
      const partials = athletes.map(a => {
        const athleteScores = scoreMap[a.id] || {};
        let partialTotal = 0;
        for (const session of relevantSessions) {
          const sd = athleteScores[session.session_number];
          if (sd && totalWeight > 0) {
            // Use same formula as final rank when all sessions complete
            const weight = isAllSessions
              ? parseFloat(session.weight_percentage) / 100
              : parseFloat(session.weight_percentage) / totalWeight;
            partialTotal += sd.normalized_score * weight;
          }
        }
        return { id: a.id, partialTotal };
      });`
);

fs.writeFileSync(path, c);
console.log('done');
