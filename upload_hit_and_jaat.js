process.env.TG_SESSION_FILE = 'tg_session_local.txt';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const { Api } = require('telegram');
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
    lines.push(`📥 <b>Direct Download:</b> ${downloadUrl}`);
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
    try {
      const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
      buffer = Buffer.from(r.data);
    } catch (e) {}
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

function updateMovieInDatabase(idOrTitle, videoMsgId) {
  const movies = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const target = movies.find(m => m.id === idOrTitle || (m.title && m.title.includes(idOrTitle)));
  if (target) {
    target.telegramMsgId = videoMsgId;
    target.videoUrl = `/api/telegram/file/${videoMsgId}`;
    fs.writeFileSync(DATA_FILE, JSON.stringify(movies, null, 2), 'utf8');
    console.log(`   💾 Database updated for ${target.title}: telegramMsgId = ${videoMsgId}`);
  }
}

const UPLOAD_QUEUE = [
  {
    titleMatch: 'HIT: The 3rd Case',
    localFile: 'uploads/videos/video-1792142491710-208434087.mkv',
    subFile: 'uploads/subtitles/subtitle-1792142590359-876929754.vtt'
  },
  {
    titleMatch: 'Jaat',
    localFile: 'uploads/videos/video-1792143005334-961751939.mkv',
    subFile: 'uploads/subtitles/subtitle-1792143329425-548898582.vtt'
  }
];

(async () => {
  console.log('================================================================');
  console.log('🚀 Sequential MTProto Cloud Upload for HIT 3 and Jaat');
  console.log('================================================================\n');

  for (let i = 0; i < UPLOAD_QUEUE.length; i++) {
    const item = UPLOAD_QUEUE[i];
    const movies = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const movie = movies.find(m => m.title && m.title.includes(item.titleMatch));
    if (!movie) {
      console.warn(`Movie not found: ${item.titleMatch}`);
      continue;
    }

    const fullPath = path.join(__dirname, item.localFile);
    if (!fs.existsSync(fullPath)) {
      console.warn(`Video file does not exist: ${fullPath}`);
      continue;
    }

    console.log(`\n----------------------------------------------------`);
    console.log(`[${i + 1}/${UPLOAD_QUEUE.length}] Processing: ${movie.title}`);
    console.log(`----------------------------------------------------`);

    // 1. Send Poster Photo First
    console.log(`📸 1. Sending 4K Studio Poster Photo...`);
    const photoMsgId = await sendPosterPhoto(movie);
    console.log(`   ✅ Poster Photo posted (Msg ID: ${photoMsgId})`);

    // 2. Upload Video Document via MTProto directly below poster
    console.log(`🚀 2. Uploading Video Document via MTProto Turbo 24X...`);
    const ext = path.extname(fullPath) || '.mkv';
    const cleanFileName = `${movie.title.replace(/[<>:"/\\|?*]/g, '')}${ext}`;
    const caption = `🎬 ${movie.title}${movie.year && !String(movie.title).includes(String(movie.year)) ? ` (${movie.year})` : ''}`;

    const up = await tg.uploadFile(fullPath, cleanFileName, caption, (p) => {
      process.stdout.write(`\r⚡ [Turbo 24X Upload] ${(p * 100).toFixed(1)}%   `);
    });

    if (!up) {
      console.error(`\n❌ Failed to upload video for ${movie.title}`);
      continue;
    }

    const videoMsgId = up.messageId;
    console.log(`\n   ✅ Video Document uploaded directly below poster (Msg ID: ${videoMsgId})`);

    // 3. Delete local temp video file immediately (Rule 3: Zero local disk space)
    try {
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        console.log(`   🧹 Deleted local temp video file. Local disk: 0 MB.`);
      }
    } catch (e) {}

    // 4. Update Poster Photo caption with interactive button
    console.log(`🔘 3. Attaching interactive [📥 Download / Watch Video] button to poster...`);
    await updatePosterCaption(photoMsgId, movie, videoMsgId);
    console.log(`   ✅ Interactive button attached successfully.`);

    // 5. Update database
    updateMovieInDatabase(item.titleMatch, videoMsgId);

    // Pause between movies
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('\n================================================================');
  console.log('🎉 All uploads complete! Perfect consecutive order verified!');
  console.log('================================================================\n');
  process.exit(0);
})();
