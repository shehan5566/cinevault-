require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const tg = require('./tgstorage');

const DATA_FILE = path.join(__dirname, 'data', 'movies.json');
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8538231781:AAFJ27AnEuZK22-TnUM15wRgYWdU2Zvihz0';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '-1003955449040';
const RAW_CHANNEL_ID = String(CHAT_ID).replace(/^-100/, '').replace(/^-/, '');

async function downloadPosterBuffer(posterUrl) {
  if (!posterUrl) return null;
  try {
    if (/^https?:\/\//i.test(posterUrl)) {
      const res = await axios.get(posterUrl, { responseType: 'arraybuffer', timeout: 20000 });
      return Buffer.from(res.data);
    }
    const rel = posterUrl.replace(/^\//, '');
    const p = [path.join(__dirname, 'public', rel), path.join(__dirname, rel)].find(f => fs.existsSync(f));
    if (p) return fs.readFileSync(p);
  } catch (err) {
    console.error('Poster fetch error:', err.message);
  }
  return null;
}

function buildCaption(m, downloadUrl = null) {
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
  const movies = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  console.log(`Starting Telegram library synchronization for ${movies.length} movies...`);

  // Process movies in order: A.R.M, Aaryan, Aavesham (or reversed to preserve chronological feed)
  // Let's process each movie cleanly
  for (let i = 0; i < movies.length; i++) {
    const m = movies[i];
    console.log(`\n========================================`);
    console.log(`[${i + 1}/${movies.length}] Processing: ${m.title}`);
    console.log(`========================================`);

    const posterBuf = await downloadPosterBuffer(m.posterUrl);
    let tempThumbPath = null;
    if (posterBuf) {
      tempThumbPath = path.join(__dirname, `temp_thumb_${Date.now()}.jpg`);
      fs.writeFileSync(tempThumbPath, posterBuf);
    }

    // 1. Send the Movie Poster with Title & Metadata
    let photoMsgId = null;
    const initialCaption = buildCaption(m, null);

    try {
      if (posterBuf) {
        const form = new FormData();
        form.append('chat_id', CHAT_ID);
        form.append('caption', initialCaption);
        form.append('parse_mode', 'HTML');
        form.append('photo', posterBuf, { filename: 'poster.jpg' });
        const res = await axios.post(`https://api.telegram.org/bot${TOKEN}/sendPhoto`, form, { headers: form.getHeaders() });
        photoMsgId = res.data?.result?.message_id;
      } else {
        const res = await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
          chat_id: CHAT_ID,
          text: initialCaption,
          parse_mode: 'HTML'
        });
        photoMsgId = res.data?.result?.message_id;
      }
      console.log(`📸 Poster posted successfully (Msg ID: ${photoMsgId})`);
    } catch (err) {
      console.error('Failed to post poster:', err.response?.data?.description || err.message);
    }

    // 2. Check if local video exists and upload to Telegram Cloud Storage
    let videoFile = null;
    if (m.videoUrl && m.videoUrl.startsWith('/uploads/videos/')) {
      const fullPath = path.join(__dirname, m.videoUrl);
      if (fs.existsSync(fullPath)) videoFile = fullPath;
    }

    if (videoFile) {
      console.log(`🚀 Uploading video file to Telegram Cloud Storage (${(fs.statSync(videoFile).size / (1024*1024)).toFixed(1)} MB)...`);
      const ext = path.extname(videoFile) || '.mp4';
      const fileName = `${m.title}${ext}`;
      const fileCaption = `🎬 <b>${m.title}</b> [${m.quality || '1080p'}]\n📥 Click to Download / Stream`;

      const up = await tg.uploadFile(videoFile, fileName, fileCaption, null, tempThumbPath);

      if (up && up.messageId) {
        const fileMsgId = up.messageId;
        const downloadLink = `https://t.me/c/${RAW_CHANNEL_ID}/${fileMsgId}`;
        console.log(`✅ Video uploaded successfully! Telegram Message ID: ${fileMsgId}`);
        console.log(`🔗 Download Link: ${downloadLink}`);

        // 3. Update the Poster message caption with the Download Link & Inline Button
        if (photoMsgId) {
          try {
            const finalCaption = buildCaption(m, downloadLink);
            await axios.post(`https://api.telegram.org/bot${TOKEN}/editMessageCaption`, {
              chat_id: CHAT_ID,
              message_id: photoMsgId,
              caption: finalCaption,
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '📥 Download / Watch Video', url: downloadLink }
                  ]
                ]
              }
            });
            console.log(`✨ Poster updated with Download Link & button!`);
          } catch (editErr) {
            console.error('Error editing poster caption:', editErr.response?.data?.description || editErr.message);
          }
        }

        // 4. Update movies.json
        const fresh = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        const target = fresh.find(x => x.id === m.id);
        if (target) {
          target.telegramMsgId = fileMsgId;
          target.videoUrl = `/api/telegram/file/${fileMsgId}`;
          fs.writeFileSync(DATA_FILE, JSON.stringify(fresh, null, 2), 'utf8');
        }

        // 5. Delete local temp video (Zero local disk space rule)
        try {
          fs.unlinkSync(videoFile);
          console.log(`🗑️ Local video deleted. PC disk space freed!`);
        } catch (delErr) {
          console.error('Error deleting local file:', delErr.message);
        }
      } else {
        console.error(`❌ Video upload failed for ${m.title}`);
      }
    } else {
      console.log(`ℹ️ No local video file available for ${m.title}.`);
      if (photoMsgId) {
        try {
          const finalCaption = buildCaption(m, '<i>Video awaiting re-upload</i>');
          await axios.post(`https://api.telegram.org/bot${TOKEN}/editMessageCaption`, {
            chat_id: CHAT_ID,
            message_id: photoMsgId,
            caption: finalCaption,
            parse_mode: 'HTML'
          });
        } catch (e) {}
      }
    }

    if (tempThumbPath && fs.existsSync(tempThumbPath)) {
      try { fs.unlinkSync(tempThumbPath); } catch (e) {}
    }
  }

  console.log('\n🎉 All movies processed and synchronized with Telegram!');
  process.exit(0);
})().catch(err => {
  console.error('Fatal sync error:', err);
  process.exit(1);
});
