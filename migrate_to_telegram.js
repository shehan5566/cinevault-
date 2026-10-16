// Move local videos in uploads/videos to the Telegram Cloud channel, update captions with interactive buttons, then delete local videos.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const tg = require('./tgstorage');

const DATA_FILE = path.join(__dirname, 'data', 'movies.json');
const PROGRESS_FILE = path.join(__dirname, 'data', 'migration_progress.json');
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8538231781:AAFJ27AnEuZK22-TnUM15wRgYWdU2Zvihz0';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '-1003955449040';

const KNOWN_PHOTO_MSGS = {
  'Bhimaa (2024)': 54,
  'Bougainvillea (2024)': 55,
  'Brother (2024)': 56,
  'Chatrapathi (2024)': 57,
  'Chhaava (2025)': 59,
  'Daaku Maharaaj (2025)': 60,
  'Deva (2025)': 63
};

function writeProgress(obj) {
  try { fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ ...obj, updatedAt: Date.now() })); } catch (e) {}
}

function buildMovieCaption(m, downloadUrl = null) {
  let lines = [
    `🎬 <b>${m.title}</b>`,
    m.sinhalaTitle ? `<i>${m.sinhalaTitle}</i>` : '',
    '',
    `🎭 <b>Genre:</b> ${(m.genre || []).join(', ')}`,
    `⭐ <b>IMDb:</b> ${m.imdbRating || 7.0}/10 | 🕒 <b>Runtime:</b> ${m.duration || '2h 00m'}`,
    `🔊 <b>Language:</b> ${m.language || 'Unknown'} | 📝 <b>Sinhala Subtitles:</b> Included`,
    `💿 <b>Quality:</b> ${m.quality || 'WEB-DL'} | 💾 <b>Size:</b> ${m.fileSize || 'N/A'}`,
    m.director ? `👤 <b>Director:</b> ${m.director}` : '',
    m.cast && m.cast.length ? `🌟 <b>Starring:</b> ${m.cast.slice(0, 5).join(', ')}` : '',
    ''
  ];

  if (downloadUrl) {
    lines.push(`📥 <b>Download Link:</b> ${downloadUrl}`);
  } else {
    lines.push(`⏳ <i>Uploading video file below...</i>`);
  }

  return lines.filter(l => l !== undefined).join('\n').trim();
}

(async () => {
  const list = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const todo = list.filter(m => m.videoUrl && m.videoUrl.startsWith('/uploads/videos/') && !m.telegramMsgId);
  console.log(`\n========================================`);
  console.log(`🎬 CineVault Cloud Sync: ${todo.length} pending movies found`);
  console.log(`========================================\n`);

  for (let idx = 0; idx < todo.length; idx++) {
    const m = todo[idx];
    const file = path.join(__dirname, m.videoUrl);
    if (!fs.existsSync(file)) { 
      console.log(`⚠️ Skip (file missing on disk): ${m.title}`); 
      continue; 
    }
    const ext = path.extname(file) || '.mkv';
    const cleanFileName = `${m.title.replace(/[<>:"/\\|?*]/g, '')}${ext}`;
    const caption = `🎬 ${m.title}${m.year && !String(m.title).includes(String(m.year)) ? ` (${m.year})` : ''}`;
    
    console.log(`\n[${idx + 1}/${todo.length}] 🚀 Syncing to Telegram: ${m.title} (${(fs.statSync(file).size / (1024*1024)).toFixed(1)} MB)`);
    writeProgress({ active: true, title: m.title, index: idx + 1, total: todo.length, pct: 0 });
    
    let last = -1;
    const up = await tg.uploadFile(file, cleanFileName, caption, (p) => {
      const pct = Math.round(p * 100);
      if (pct !== last && pct % 5 === 0) {
        last = pct;
        writeProgress({ active: true, title: m.title, index: idx + 1, total: todo.length, pct });
      }
    });

    if (!up) { 
      console.error(`\n❌ FAILED to upload: ${m.title} (Local video kept safely for retry)`); 
      continue; 
    }

    // Re-read JSON to preserve concurrent edits
    const fresh = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const target = fresh.find(x => x.id === m.id);
    if (target) {
      target.telegramMsgId = up.messageId;
      target.videoUrl = `/api/telegram/file/${up.messageId}`;
      fs.writeFileSync(DATA_FILE, JSON.stringify(fresh, null, 2), 'utf8');
      console.log(`\n✅ Updated data/movies.json: ${m.title} -> telegramMsgId: ${up.messageId}`);
    }

    // Update Telegram Channel Poster Caption with button
    const photoMsgId = KNOWN_PHOTO_MSGS[m.title];
    if (photoMsgId) {
      try {
        const rawChatId = String(TELEGRAM_CHAT_ID).replace(/^-100/, '').replace(/^-/, '');
        const downloadLink = `https://t.me/c/${rawChatId}/${up.messageId}`;
        const updatedCaption = buildMovieCaption(target || m, downloadLink);
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageCaption`, {
          chat_id: TELEGRAM_CHAT_ID,
          message_id: photoMsgId,
          caption: updatedCaption,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: '📥 Download / Watch Video', url: downloadLink }]]
          }
        });
        console.log(`🔘 Updated Telegram poster button for: ${m.title}`);
      } catch (tgErr) {
        console.warn(`Could not update Telegram poster caption:`, tgErr.message);
      }
    }

    // Delete local video file immediately (Rule 3: Zero local disk space)
    try {
      fs.unlinkSync(file);
      console.log(`🧹 Deleted local temp video file. Local disk: 0 MB.`);
    } catch (err) {
      console.error(`Error deleting local video:`, err.message);
    }
  }

  writeProgress({ active: false });
  console.log(`\n🎉 All pending movie uploads to Telegram Cloud Storage completed!`);
  process.exit(0);
})().catch(e => { 
  console.error('Migration error:', e.message); 
  process.exit(1); 
});

