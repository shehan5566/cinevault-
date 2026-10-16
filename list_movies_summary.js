const fs = require('fs');
const movies = JSON.parse(fs.readFileSync('data/movies.json', 'utf8'));
console.log('Total movies:', movies.length);
movies.forEach((m, idx) => {
  console.log((idx + 1) + '. [' + m.id + '] ' + m.title + ' | tgMsgId: ' + m.telegramMsgId + ' | videoUrl: ' + (m.videoUrl ? m.videoUrl.substring(0, 45) : 'NONE'));
});
