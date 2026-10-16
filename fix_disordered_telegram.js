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
  } else {
    console.warn(`   ⚠️ Movie not found in database for update: ${idOrTitle}`);
  }
}

(async () => {
  console.log('================================================================');
  console.log('⚡ CineVault Sequential Reorganization for Interleaved Movies');
  console.log('================================================================\n');

  const client = await tg.getClient();
  const peer = await tg.getPeer();

  // Phase 1: Movies whose documents already exist in Telegram
  const REORDER_LIST = [
    { titleMatch: 'Hanu Man', sourceVideoMsgId: 112 },
    { titleMatch: 'K.G.F: Chapter 1', sourceVideoMsgId: 114 },
    { titleMatch: 'Harom Hara', sourceVideoMsgId: 115 }
  ];

  const allMovies = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

  for (let i = 0; i < REORDER_LIST.length; i++) {
    const item = REORDER_LIST[i];
    const movie = allMovies.find(m => m.title && m.title.includes(item.titleMatch));
    if (!movie) {
      console.warn(`[Warning] Movie not found: ${item.titleMatch}`);
      continue;
    }

    console.log(`[${i + 1}/${REORDER_LIST.length}] Processing consecutive pairing for: ${movie.title}...`);

    // 1. Fetch document attributes from existing message
    const existingMsgs = await client.getMessages(peer, { ids: [item.sourceVideoMsgId] });
    const doc = existingMsgs && existingMsgs[0]?.media?.document;
    if (!doc) {
      throw new Error(`Could not find document in msg ${item.sourceVideoMsgId} for ${movie.title}`);
    }

    // 2. Send 4K Poster Photo first
    console.log(`   📸 Sending 4K Studio Poster Photo...`);
    const newPhotoId = await sendPosterPhoto(movie);
    console.log(`   ✅ Poster posted (Msg ID: ${newPhotoId})`);

    // 3. Send Document directly below the poster
    console.log(`   ⚡ Transferring Document instantly below poster...`);
    const inputDoc = new Api.InputDocument({
      id: doc.id,
      accessHash: doc.accessHash,
      fileReference: doc.fileReference
    });

    const sentDoc = await client.sendFile(peer, {
      file: inputDoc,
      caption: `🎬 <b>${movie.title}</b> [${movie.quality || 'WEB-DL'}]\n\n📝 Sinhala Subtitles: Included`,
      parseMode: 'html',
      forceDocument: true
    });
    const newVideoId = sentDoc.id;
    console.log(`   ✅ Video Document posted directly below poster (Msg ID: ${newVideoId})`);

    // 4. Update poster button to point to new video
    console.log(`   🔘 Attaching interactive button to poster...`);
    await updatePosterCaption(newPhotoId, movie, newVideoId);
    console.log(`   ✅ Button linked to Msg ${newVideoId}`);

    // 5. Update database
    updateMovieInDatabase(item.titleMatch, newVideoId);

    // Small breather
    await new Promise(r => setTimeout(r, 1500));
  }

  // Phase 2: Delete old interleaved messages
  const OLD_INTERLEAVED_MSGS = [110, 111, 112, 113, 114, 115];
  console.log(`\n🧹 Deleting old interleaved messages: [${OLD_INTERLEAVED_MSGS.join(', ')}]...`);
  try {
    const delRes = await client.deleteMessages(peer, OLD_INTERLEAVED_MSGS, { revoke: true });
    console.log(`   ✅ Successfully deleted old interleaved messages!`);
  } catch (delErr) {
    console.error(`   ⚠️ Failed to delete some messages:`, delErr.message);
  }

  console.log('\n================================================================');
  console.log('✅ Phase 1 & 2 Complete! Hanu Man, K.G.F, and Harom Hara are now consecutive!');
  console.log('================================================================\n');

  process.exit(0);
})();
