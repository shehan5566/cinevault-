const fs = require('fs');
const html = fs.readFileSync('scratch/animal_sub.zip', 'utf8');
const matches = [...html.matchAll(/https?:\/\/[^\s"'<>]+\.(?:zip|rar|srt)/gi)].map(m => m[0]);
console.log('Matches:', matches);

const hrefs = [...html.matchAll(/href="([^"]+)"/gi)].map(m => m[1]).filter(h => h.includes('download') || h.includes('zip') || h.includes('api'));
console.log('Hrefs:', hrefs);
