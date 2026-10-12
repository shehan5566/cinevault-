// One-off: post name + poster to the Telegram channel for movies that have a stored video.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8538231781:AAFJ27AnEuZK22-TnUM15wRgYWdU2Zvihz0';
const CHAT = process.env.TELEGRAM_CHAT_ID || '-1003955449040';

(async () => {
  const list = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'movies.json'), 'utf8'));
  const movies = list.filter(m => m.telegramMsgId || (m.videoUrl || '').startsWith('/uploads/videos/'));
  for (const m of movies) {
    const caption = `🎬 ${m.title}${m.year ? ` (${m.year})` : ''}`;
    const url = m.posterUrl || '';
    let buffer = null;
    if (/^https?:\/\//i.test(url)) {
      buffer = Buffer.from((await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 })).data);
    } else if (url) {
      const rel = url.replace(/^\//, '');
      const p = [path.join(__dirname, 'public', rel), path.join(__dirname, rel)].find(f => fs.existsSync(f));
      if (p) buffer = fs.readFileSync(p);
    }
    try {
      if (buffer) {
        const form = new FormData();
        form.append('chat_id', CHAT);
        form.append('caption', caption);
        form.append('photo', buffer, { filename: 'poster.jpg' });
        await axios.post(`https://api.telegram.org/bot${TOKEN}/sendPhoto`, form, { headers: form.getHeaders() });
      } else {
        await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, { chat_id: CHAT, text: caption });
      }
      console.log(`Posted: ${caption}`);
    } catch (e) {
      console.log(`FAILED ${caption}:`, e.response?.data?.description || e.message);
    }
  }
})();
