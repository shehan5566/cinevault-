process.env.TG_SESSION_FILE = 'tg_session_local.txt';
require('dotenv').config();
const tg = require('./tgstorage');

(async () => {
  try {
    const client = await tg.getClient();
    const peer = await tg.getPeer();
    const ids = Array.from({ length: 25 }, (_, i) => 120 + i);
    const msgs = await client.getMessages(peer, { ids });
    
    console.log('=== CHANNEL MESSAGES 120-144 ===');
    msgs.forEach(m => {
      if (m && m.className !== 'MessageEmpty') {
        const isPhoto = m.media && m.media.className.includes('Photo');
        const isDoc = m.media && m.media.className.includes('Document');
        let filename = '';
        if (isDoc && m.media.document && m.media.document.attributes) {
          const fnAttr = m.media.document.attributes.find(a => a.className === 'DocumentAttributeFilename');
          if (fnAttr) filename = fnAttr.fileName;
        }
        const titleLine = (m.message || '').split('\n')[0].slice(0, 40);
        const btnUrl = m.replyMarkup?.rows[0]?.buttons[0]?.url || '';
        console.log(`Msg ${m.id}: ${isPhoto ? '[PHOTO]' : (isDoc ? '[DOC]' : '[OTHER]')} ${titleLine || filename} ${btnUrl ? '-> Button: ' + btnUrl : ''}`);
      }
    });
    console.log('=== END ===');
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
