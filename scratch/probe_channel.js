require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Api } = require('telegram');
const tg = require('../tgstorage');
const axios = require('axios');
(async () => {
  const TOKEN = '8538231781:AAFJ27AnEuZK22-TnUM15wRgYWdU2Zvihz0';
  const r = await axios.get(`https://api.telegram.org/bot${TOKEN}/getChatMember?chat_id=-1003955449040&user_id=8538231781`).catch(e => e.response.data);
  console.log('botAPI member:', JSON.stringify(r.data || r).slice(0, 300));
  const client = await tg.getClient();
  try {
    const res = await client.invoke(new Api.channels.GetChannels({ id: [new Api.InputChannel({ channelId: BigInt('3955449040'), accessHash: BigInt(0) })] }));
    console.log('GetChannels:', res.chats.map(c => ({ id: String(c.id), hash: String(c.accessHash), title: c.title })));
  } catch (e) { console.log('GetChannels err:', e.message); }
  try {
    const ent = await client.getEntity('-1003955449040');
    console.log('getEntity ok', String(ent.id), String(ent.accessHash));
  } catch (e) { console.log('getEntity err:', e.message); }
  process.exit(0);
})();
