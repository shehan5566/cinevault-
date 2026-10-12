const axios = require('axios');

async function testEmbeds() {
  const title = 'Interstellar';
  const urls = [
    `https://vidsrc.cc/v2/embed/movie?title=${encodeURIComponent(title)}`,
    `https://vidsrc.me/embed/movie?title=${encodeURIComponent(title)}`,
    `https://multiembed.mov/?video_id=${encodeURIComponent(title)}`,
    `https://vidsrc.xyz/embed/movie?title=${encodeURIComponent(title)}`,
    `https://autoembed.cc/embed/movie/${encodeURIComponent(title)}`,
    `https://2embed.cc/embed/${encodeURIComponent(title)}`
  ];

  for (const url of urls) {
    try {
      const res = await axios.get(url, { 
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, 
        timeout: 6000 
      });
      console.log(url, '=> Status:', res.status, 'Len:', res.data.length);
    } catch(e) {
      console.log(url, '=> Error:', e.message);
    }
  }
}

testEmbeds();
