const https = require('https');
const http = require('http');
const fs = require('fs');

async function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
      let data = '';
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let nextUrl = res.headers.location;
        if (!nextUrl.startsWith('http')) {
          const u = new URL(url);
          nextUrl = `${u.protocol}//${u.host}${nextUrl}`;
        }
        return resolve(fetchUrl(nextUrl));
      }
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

(async () => {
  const html = await fetchUrl('https://piratelk.com/atharva-2023-sinhala-subtitles/');
  fs.writeFileSync('pirate_full.html', html, 'utf8');
  console.log('Saved pirate_full.html, size:', html.length);
})();
