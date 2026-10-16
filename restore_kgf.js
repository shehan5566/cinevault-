const fs = require('fs');
const { execSync } = require('child_process');

// 1. Get KGF from commit 80b614e
const gitJson = execSync('git show 80b614e:data/movies.json', { maxBuffer: 10 * 1024 * 1024 }).toString('utf8');
const oldMovies = JSON.parse(gitJson);
const kgf = oldMovies.find(m => m.title && (m.title.includes('K.G.F') || m.title.includes('KGF')));

if (!kgf) {
  console.error('KGF not found in commit 80b614e!');
  process.exit(1);
}

console.log('Found KGF:', kgf.title, 'msgId:', kgf.telegramMsgId, 'videoUrl:', kgf.videoUrl);

// 2. Read current movies.json
const currentMovies = JSON.parse(fs.readFileSync('data/movies.json', 'utf8'));

// 3. Check if KGF exists in currentMovies
const existingIndex = currentMovies.findIndex(m => m.id === kgf.id || (m.title && m.title.includes('K.G.F')));
if (existingIndex >= 0) {
  currentMovies[existingIndex] = kgf;
} else {
  currentMovies.unshift(kgf);
}

// 4. Also make sure Harom Hara has telegramMsgId 115 if it was uploaded
const haromHara = currentMovies.find(m => m.title && m.title.includes('Harom Hara'));
if (haromHara) {
  haromHara.telegramMsgId = 115;
  haromHara.videoUrl = '/api/telegram/file/115';
}

fs.writeFileSync('data/movies.json', JSON.stringify(currentMovies, null, 2), 'utf8');
console.log('Saved data/movies.json! Total movies count:', currentMovies.length);
