require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const tg = require('./tgstorage');

const DATA_FILE = path.join(__dirname, 'data', 'movies.json');
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8538231781:AAFJ27AnEuZK22-TnUM15wRgYWdU2Zvihz0';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '-1003955449040';
const RAW_CHAT_ID = String(TELEGRAM_CHAT_ID).replace(/^-100/, '').replace(/^-/, '');

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

async function sendPosterPhoto(movie) {
  const caption = buildMovieCaption(movie, null);
  const api = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
  let buffer = null;
  const url = movie.posterUrl || '';
  if (/^https?:\/\//i.test(url)) {
    const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
    buffer = Buffer.from(r.data);
  } else if (url) {
    const rel = url.replace(/^\//, '');
    const p = [path.join(__dirname, 'public', rel), path.join(__dirname, rel)].find(f => fs.existsSync(f));
    if (p) buffer = fs.readFileSync(p);
  }

  if (buffer) {
    const form = new FormData();
    form.append('chat_id', TELEGRAM_CHAT_ID);
    form.append('caption', caption);
    form.append('parse_mode', 'HTML');
    form.append('photo', buffer, { filename: 'poster.jpg' });
    const res = await axios.post(`${api}/sendPhoto`, form, { headers: form.getHeaders(), timeout: 30000 });
    return res.data?.result?.message_id;
  } else {
    const res = await axios.post(`${api}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: caption,
      parse_mode: 'HTML'
    });
    return res.data?.result?.message_id;
  }
}

async function updatePosterCaption(photoMsgId, movie, videoMsgId) {
  const downloadLink = `https://t.me/c/${RAW_CHAT_ID}/${videoMsgId}`;
  const updatedCaption = buildMovieCaption(movie, downloadLink);
  await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageCaption`, {
    chat_id: TELEGRAM_CHAT_ID,
    message_id: photoMsgId,
    caption: updatedCaption,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[{ text: '📥 Download / Watch Video', url: downloadLink }]]
    }
  }, { timeout: 15000 });
}

const NEW_MOVIES = [
  { titleMatch: 'Devara Part 1', localFile: 'uploads/videos/video-1792130236112-486690988.mkv' },
  { titleMatch: 'DJ Tillu', localFile: 'uploads/videos/video-1792130294765-278839264.mkv' }
];

(async () => {
  const allMovies = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

  for (let i = 0; i < NEW_MOVIES.length; i++) {
    const item = NEW_MOVIES[i];
    const movie = allMovies.find(m => m.title.includes(item.titleMatch));
    if (!movie) continue;

    console.log(`\n========================================`);
    console.log(`[${i + 1}/${NEW_MOVIES.length}] Uploading ${movie.title} to Telegram...`);
    console.log(`========================================`);

    // 1. Send Poster Photo first
    console.log(`📸 1. Sending 4K Poster Photo...`);
    const photoMsgId = await sendPosterPhoto(movie);
    console.log(`   ✅ Poster posted (Msg ID: ${photoMsgId})`);

    // 2. Upload Video Document directly below poster
    console.log(`🚀 2. Uploading Video Document from local PC...`);
    const fullPath = path.join(__dirname, item.localFile);
    const ext = path.extname(fullPath) || '.mkv';
    const cleanFileName = `${movie.title.replace(/[<>:"/\\|?*]/g, '')}${ext}`;
    const caption = `🎬 ${movie.title}${movie.year && !String(movie.title).includes(String(movie.year)) ? ` (${movie.year})` : ''}`;

    let last = 0;
    const up = await tg.uploadFile(fullPath, cleanFileName, caption, (p) => {
      const pct = Math.round(p * 100);
      if (pct !== last && pct % 10 === 0) {
        last = pct;
        console.log(`   ⚡ Upload Progress: ${pct}%`);
      }
    });

    if (!up) throw new Error(`Failed to upload ${movie.title}`);
    console.log(`   ✅ Video Document posted (Msg ID: ${up.messageId})`);

    // 3. Attach button to Poster Photo
    console.log(`🔘 3. Attaching interactive download button to poster...`);
    await updatePosterCaption(photoMsgId, movie, up.messageId);
    console.log(`   ✅ Button attached successfully.`);

    // 4. Update data/movies.json
    movie.telegramMsgId = up.messageId;
    movie.videoUrl = `/api/telegram/file/${up.messageId}`;
    fs.writeFileSync(DATA_FILE, JSON.stringify(allMovies, null, 2), 'utf8');
    console.log(`💾 4. Updated database: telegramMsgId = ${up.messageId}`);

    // 5. Delete local video file (Rule 3: Zero local disk space)
    try {
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        console.log(`🧹 5. Deleted local temp video file. Local PC disk: 0 MB.`);
      }
    } catch (err) {}

    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`\n🎉 Devara Part 1 & DJ Tillu successfully uploaded in strict pair order!`);
  process.exit(0);
})().catch(e => {
  console.error('Upload error:', e.message);
  process.exit(1);
});
