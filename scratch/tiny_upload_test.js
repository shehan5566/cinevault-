require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const tg = require('../tgstorage');
(async () => {
  const f = path.join(__dirname, 'tiny_test.bin');
  fs.writeFileSync(f, Buffer.alloc(300000, 1));
  const up = await tg.uploadFile(f, 'cinevault_test.bin', 'test upload (will be deleted)');
  console.log('RESULT', JSON.stringify(up));
  if (up) {
    const c = await tg.getClient();
    const res = await c.invoke(new (require('telegram').Api.channels.GetChannels)({ id: [new (require('telegram').Api.InputChannel)({ channelId: BigInt('3955449040'), accessHash: BigInt(0) })] }));
    await c.deleteMessages(res.chats[0], [up.messageId], { revoke: true });
    console.log('test message deleted');
  }
  fs.unlinkSync(f);
  process.exit(0);
})();
