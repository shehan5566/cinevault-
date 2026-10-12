// One-off: move local videos in uploads/videos to the Telegram channel, then delete them locally.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const tg = require('./tgstorage');

const DATA_FILE = path.join(__dirname, 'data', 'movies.json');
const PROGRESS_FILE = path.join(__dirname, 'data', 'migration_progress.json');
function writeProgress(obj) {
  try { fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ ...obj, updatedAt: Date.now() })); } catch (e) {}
}

(async () => {
  const list = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const todo = list.filter(m => m.videoUrl && m.videoUrl.startsWith('/uploads/videos/') && !m.telegramMsgId);
  console.log(`Movies to migrate: ${todo.length}`);

  for (let idx = 0; idx < todo.length; idx++) {
    const m = todo[idx];
    const file = path.join(__dirname, m.videoUrl);
    if (!fs.existsSync(file)) { console.log(`Skip (file missing): ${m.title}`); continue; }
    const ext = path.extname(file);
    const caption = `🎬 ${m.title}${m.year && !String(m.title).includes(String(m.year)) ? ` (${m.year})` : ''}`;
    console.log(`Uploading: ${m.title}`);
    writeProgress({ active: true, title: m.title, index: idx + 1, total: todo.length, pct: 0 });
    let last = 0;
    const up = await tg.uploadFile(file, `${m.title}${ext}`, caption, (p) => {
      const pct = Math.round(p * 100);
      if (pct !== last) { last = pct; writeProgress({ active: true, title: m.title, index: idx + 1, total: todo.length, pct }); }
    });
    if (!up) { console.log(`FAILED: ${m.title} (local file kept)`); continue; }

    // Re-read so we don't overwrite changes made by the running server
    const fresh = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const target = fresh.find(x => x.id === m.id);
    if (target) {
      target.telegramMsgId = up.messageId;
      target.videoUrl = `/api/telegram/file/${up.messageId}`;
      fs.writeFileSync(DATA_FILE, JSON.stringify(fresh, null, 2));
    }
    fs.unlinkSync(file);
    console.log(`Done: ${m.title} -> message ${up.messageId}; local file deleted.`);
  }
  writeProgress({ active: false });
  process.exit(0);
})().catch(e => { console.error('Migration error:', e.message); process.exit(1); });
