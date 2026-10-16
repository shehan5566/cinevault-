require('dotenv').config();
const tg = require('./tgstorage');
const { Api } = require('telegram');

(async () => {
  try {
    const client = await tg.getClient();
    const rawChatId = String(process.env.TELEGRAM_CHAT_ID || '-1003955449040').replace(/^-100/, '').replace(/^-/, '');
    const chRes = await client.invoke(new Api.channels.GetChannels({
      id: [new Api.InputChannel({ channelId: BigInt(rawChatId), accessHash: BigInt(0) })]
    }));
    const peer = new Api.InputPeerChannel({ channelId: chRes.chats[0].id, accessHash: chRes.chats[0].accessHash });
    const msgs = await client.getMessages(peer, { limit: 30 });
    console.log('--- RECENT CHANNEL MESSAGES (Newest first) ---');
    for (const m of msgs) {
      const isPhoto = !!m.media?.photo;
      const isDoc = !!m.media?.document;
      const textPreview = (m.message || '').split('\n')[0].substring(0, 50);
      console.log(`Msg ID ${m.id}: [${isPhoto ? 'PHOTO' : isDoc ? 'DOCUMENT' : 'TEXT'}] ${textPreview}`);
    }
  } catch (err) {
    console.error('Check channel error:', err.message);
  }
  process.exit(0);
})();
