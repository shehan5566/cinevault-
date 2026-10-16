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

const SYNC_LIST = [
  { titleMatch: 'Devara Part 1', existingVideoMsgId: 97 },
  { titleMatch: 'DJ Tillu', existingVideoMsgId: 99 },
  { titleMatch: 'Hanu Man', isLocalUpload: true, localFile: 'uploads/videos/video-1792141315076-353152323.mkv', subFile: 'uploads/subtitles/subtitle-1792141504660-975562185.vtt' },
  { titleMatch: 'Harom Hara', isLocalUpload: true, localFile: 'uploads/videos/video-1792141569545-918749277.mkv', subFile: 'uploads/subtitles/subtitle-1792141706014-967437609.vtt' },
  { titleMatch: 'HIT: The 3rd Case', isLocalUpload: true, localFile: 'uploads/videos/video-1792142491710-208434087.mkv', subFile: 'uploads/subtitles/subtitle-1792142590359-876929754.vtt' },
  { titleMatch: 'Jaat', isLocalUpload: true, localFile: 'uploads/videos/video-1792143005334-961751939.mkv', subFile: 'uploads/subtitles/subtitle-1792143329425-548898582.vtt' }
];

const OLD_MESSAGES_TO_DELETE = [92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105];

(async () => {
  console.log('====================================================');
  console.log('🎬 CineVault Telegram Channel Ordering & Sync (Rule 5)');
  console.log('====================================================\n');

  const client = await tg.getClient();
  const chRes = await client.invoke(new Api.channels.GetChannels({
    id: [new Api.InputChannel({ channelId: BigInt(RAW_CHAT_ID), accessHash: BigInt(0) })]
  }));
  const peer = new Api.InputPeerChannel({
    channelId: chRes.chats[0].id,
    accessHash: chRes.chats[0].accessHash
  });

  const allMovies = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

  for (let i = 0; i < SYNC_LIST.length; i++) {
    const item = SYNC_LIST[i];
    const movie = allMovies.find(m => m.title.includes(item.titleMatch));
    if (!movie) {
      console.warn(`[Warning] Movie not found in database: ${item.titleMatch}`);
      continue;
    }

    console.log(`\n----------------------------------------------------`);
    console.log(`[${i + 1}/${SYNC_LIST.length}] Processing: ${movie.title}`);
    console.log(`----------------------------------------------------`);

    // Step A: Send Poster Photo First
    console.log(`📸 1. Sending 4K Studio Poster Photo...`);
    const photoMsgId = await sendPosterPhoto(movie);
    console.log(`   ✅ Poster Photo posted (Msg ID: ${photoMsgId})`);

    // Step B: Send Video Document directly below the poster
    let newVideoMsgId = null;

    if (item.existingVideoMsgId) {
      console.log(`⚡ 2. Instantly transferring existing Video Document (from Msg ${item.existingVideoMsgId})...`);
      const existingMsgs = await client.getMessages(peer, { ids: [item.existingVideoMsgId] });
      const doc = existingMsgs && existingMsgs[0]?.media?.document;
      if (!doc) {
        throw new Error(`Could not find document in msg ${item.existingVideoMsgId} for ${movie.title}`);
      }

      const inputDoc = new Api.InputDocument({
        id: doc.id,
        accessHash: doc.accessHash,
        fileReference: doc.fileReference
      });

      const caption = `🎬 ${movie.title}${movie.year && !String(movie.title).includes(String(movie.year)) ? ` (${movie.year})` : ''}`;
      const newVideoMsg = await client.sendFile(peer, {
        file: inputDoc,
        caption: caption
      });

      newVideoMsgId = newVideoMsg.id;
      console.log(`   ✅ Video Document sent instantly directly below poster (New Msg ID: ${newVideoMsgId})`);
    } else if (item.isLocalUpload) {
      const fullPath = path.join(__dirname, item.localFile);
      if (!fs.existsSync(fullPath)) {
        throw new Error(`Local video file missing: ${fullPath}`);
      }

      // Check subtitle muxing
      if (item.subFile) {
        const subFullPath = path.join(__dirname, item.subFile);
        if (fs.existsSync(subFullPath)) {
          try {
            const ffmpegPath = require('ffmpeg-static');
            const { exec } = require('child_process');
            const util = require('util');
            const execAsync = util.promisify(exec);
            const muxedPath = fullPath + '.muxed.mkv';
            console.log(`🔤 Embedding Sinhala subtitle track...`);
            await execAsync(`"${ffmpegPath}" -y -i "${fullPath}" -i "${subFullPath}" -map 0 -map 1:0 -c copy -c:s srt -metadata:s:s:0 language=sin -metadata:s:s:0 title="Sinhala Subtitle" "${muxedPath}"`);
            if (fs.existsSync(muxedPath) && fs.statSync(muxedPath).size > 1000) {
              fs.unlinkSync(fullPath);
              fs.renameSync(muxedPath, fullPath);
              console.log(`   ✅ Subtitle embedded successfully inside MKV.`);
            }
          } catch (mErr) {
            console.warn(`Subtitle mux notice:`, mErr.message);
          }
        }
      }

      console.log(`🚀 2. Uploading Video Document with MTProto Turbo 24X...`);
      const ext = path.extname(fullPath) || '.mkv';
      const cleanFileName = `${movie.title.replace(/[<>:"/\\|?*]/g, '')}${ext}`;
      const caption = `🎬 ${movie.title}${movie.year && !String(movie.title).includes(String(movie.year)) ? ` (${movie.year})` : ''}`;

      const up = await tg.uploadFile(fullPath, cleanFileName, caption, (p) => {
        process.stdout.write(`\r⚡ [Turbo 24X Upload] ${(p * 100).toFixed(1)}%   `);
      });

      if (!up) {
        throw new Error(`Failed to upload local video for ${movie.title}`);
      }

      newVideoMsgId = up.messageId;
      console.log(`\n   ✅ Video Document uploaded directly below poster (Msg ID: ${newVideoMsgId})`);

      // Delete local video file immediately (Rule 3: Zero local disk space)
      try {
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
          console.log(`   🧹 Deleted local temp video file. Local disk: 0 MB.`);
        }
      } catch (err) {}
    }

    // Step C: Update Poster Photo caption with interactive button
    if (photoMsgId && newVideoMsgId) {
      console.log(`🔘 3. Attaching interactive [📥 Download / Watch Video] button to poster...`);
      await updatePosterCaption(photoMsgId, movie, newVideoMsgId);
      console.log(`   ✅ Interactive button attached successfully.`);
    }

    // Step D: Update data/movies.json
    movie.telegramMsgId = newVideoMsgId;
    movie.videoUrl = `/api/telegram/file/${newVideoMsgId}`;
    try {
      const freshMovies = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      const target = freshMovies.find(m => m.id === movie.id || (m.title && item.titleMatch && m.title.includes(item.titleMatch)));
      if (target) {
        target.telegramMsgId = newVideoMsgId;
        target.videoUrl = `/api/telegram/file/${newVideoMsgId}`;
        fs.writeFileSync(DATA_FILE, JSON.stringify(freshMovies, null, 2), 'utf8');
      } else {
        freshMovies.unshift(movie);
        fs.writeFileSync(DATA_FILE, JSON.stringify(freshMovies, null, 2), 'utf8');
      }
    } catch (e) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(allMovies, null, 2), 'utf8');
    }
    console.log(`💾 4. Updated database: telegramMsgId = ${newVideoMsgId}`);

    // Small delay between movies to avoid Telegram FloodWait
    await new Promise(r => setTimeout(r, 2000));
  }

  // Step E: Delete old out-of-order messages from the Telegram channel
  console.log(`\n====================================================`);
  console.log(`🧹 Cleaning up ${OLD_MESSAGES_TO_DELETE.length} old disorganized messages...`);
  console.log(`====================================================`);
  try {
    await client.deleteMessages(peer, OLD_MESSAGES_TO_DELETE, { revoke: true });
    console.log(`✅ Successfully deleted old disorganized messages:`, OLD_MESSAGES_TO_DELETE.join(', '));
  } catch (delErr) {
    console.warn(`Notice while deleting old messages:`, delErr.message);
  }

  console.log(`\n🎉 Telegram Channel successfully reorganized into 100% strict pairing!`);
  console.log(`📌 Order in Telegram Channel:`);
  console.log(`   [Poster Photo] -> [Video File] (Repeated strictly for every movie)`);
  console.log(`💾 data/movies.json updated with all new message IDs.`);
  process.exit(0);
})().catch(e => {
  console.error('\n❌ Reorganization error:', e.message);
  process.exit(1);
});
