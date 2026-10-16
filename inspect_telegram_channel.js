process.env.TG_SESSION_FILE = 'tg_session_local.txt';
require('dotenv').config();
const fs = require('fs');
const tg = require('./tgstorage');

(async () => {
  try {
    const client = await tg.getClient();
    const peer = await tg.getPeer();
    
    // Check IDs from 1 to 130 in chunks of 50
    const allIds = Array.from({ length: 130 }, (_, i) => i + 1);
    const results = [];

    for (let i = 0; i < allIds.length; i += 50) {
      const slice = allIds.slice(i, i + 50);
      const msgs = await client.getMessages(peer, { ids: slice });
      for (const m of msgs) {
        if (!m || m.className === 'MessageEmpty') continue;
        const isPhoto = m.media && m.media.className.includes('Photo');
        const isDoc = m.media && m.media.className.includes('Document');
        let filename = '';
        let caption = (m.message || '').split('\n')[0].slice(0, 50);
        if (isDoc && m.media.document && m.media.document.attributes) {
          const fnAttr = m.media.document.attributes.find(a => a.className === 'DocumentAttributeFilename');
          if (fnAttr) filename = fnAttr.fileName;
        }
        results.push({
          id: m.id,
          type: isPhoto ? 'PHOTO' : (isDoc ? 'DOCUMENT' : m.media?.className || 'TEXT'),
          caption: caption,
          filename: filename
        });
      }
    }

    console.log('--- CHANNEL MESSAGES ---');
    results.forEach(r => {
      console.log(`Msg ${r.id}: [${r.type}] ${r.caption || r.filename || ''}`);
    });
    console.log('--- END ---');
    process.exit(0);
  } catch (err) {
    console.error('Inspection error:', err);
    process.exit(1);
  }
})();
