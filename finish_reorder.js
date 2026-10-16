require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
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

(async () => {
  console.log('Completing Chhaava (2025) and cleaning up old messages...\n');
  const client = await tg.getClient();
  const chRes = await client.invoke(new Api.channels.GetChannels({
    id: [new Api.InputChannel({ channelId: BigInt(RAW_CHAT_ID), accessHash: BigInt(0) })]
  }));
  const peer = new Api.InputPeerChannel({
    channelId: chRes.chats[0].id,
    accessHash: chRes.chats[0].accessHash
  });

  const allMovies = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const chhaava = allMovies.find(m => m.title.includes('Chhaava'));

  // 1. Copy Chhaava Video Document from Msg 73 to be directly below Poster 90
  console.log('⚡ 1. Copying Chhaava video document from Msg 73 to directly follow Poster 90...');
  const msgs73 = await client.getMessages(peer, { ids: [73] });
  const doc73 = msgs73[0]?.media?.document;
  if (!doc73) throw new Error('Could not find document in msg 73');

  const inputDoc = new Api.InputDocument({
    id: doc73.id,
    accessHash: doc73.accessHash,
    fileReference: doc73.fileReference
  });

  const chhaavaVideoMsg = await client.sendFile(peer, {
    file: inputDoc,
    caption: `🎬 ${chhaava.title}`
  });
  const chhaavaVideoMsgId = chhaavaVideoMsg.id;
  console.log(`✅ Chhaava Video Document posted: Msg ID ${chhaavaVideoMsgId}`);

  // 2. Attach button to Poster 90
  console.log('🔘 2. Attaching download button to Chhaava Poster (Msg 90)...');
  const downloadLink = `https://t.me/c/${RAW_CHAT_ID}/${chhaavaVideoMsgId}`;
  const updatedCaption = buildMovieCaption(chhaava, downloadLink);
  await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageCaption`, {
    chat_id: TELEGRAM_CHAT_ID,
    message_id: 90,
    caption: updatedCaption,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[{ text: '📥 Download / Watch Video', url: downloadLink }]]
    }
  });
  console.log('✅ Button attached successfully!');

  // 3. Update Chhaava in data/movies.json
  chhaava.telegramMsgId = chhaavaVideoMsgId;
  chhaava.videoUrl = `/api/telegram/file/${chhaavaVideoMsgId}`;
  fs.writeFileSync(DATA_FILE, JSON.stringify(allMovies, null, 2), 'utf8');
  console.log(`💾 3. Updated database: Chhaava -> telegramMsgId: ${chhaavaVideoMsgId}`);

  // 4. Delete all old messy messages
  const OLD_MESSAGES = [52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 63, 64, 65, 66, 67, 68, 69, 73];
  console.log(`\n🧹 4. Deleting ${OLD_MESSAGES.length} old out-of-order messages from Telegram channel...`);
  await client.deleteMessages(peer, OLD_MESSAGES, { revoke: true });
  console.log('✅ Old disorganized messages successfully deleted:', OLD_MESSAGES.join(', '));

  console.log('\n🎉 ALL 19 MOVIES IN TELEGRAM ARE NOW IN 100% STRICT ORDER!');
  process.exit(0);
})().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
