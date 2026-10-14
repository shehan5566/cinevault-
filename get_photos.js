const axios = require('axios');

async function getOg(url) {
  try {
    const res = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      timeout: 8000
    });
    const m = res.data.match(/property="og:image"\s+content="([^"]+)"/i) || res.data.match(/content="([^"]+)"\s+property="og:image"/i);
    return m ? m[1] : null;
  } catch(e) {
    return 'Error: ' + e.message;
  }
}

async function main() {
  console.log('Gagan Vihari:', await getOg('https://www.filmibeat.com/celebs/gagan-vihari.html'));
}

main();
