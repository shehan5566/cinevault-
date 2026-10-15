const https = require('https');
const http = require('http');
const fs = require('fs');

async function fetchUrl(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const reqHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://piratelk.com/atharva-2023-sinhala-subtitles/',
      ...headers
    };
    mod.get(url, { headers: reqHeaders }, (res) => {
      console.log('Status:', res.statusCode, 'Headers:', res.headers['content-type'], res.headers['location'], res.headers['content-disposition']);
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let nextUrl = res.headers.location;
        if (!nextUrl.startsWith('http')) {
          nextUrl = `${u.protocol}//${u.host}${nextUrl}`;
        }
        return resolve(fetchUrl(nextUrl, headers));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ buffer: Buffer.concat(chunks), headers: res.headers }));
    }).on('error', reject);
  });
}

(async () => {
  try {
    const res = await fetchUrl('https://piratelk.com/download/atharva-2023-sinhala-subtitles/?tmstv=1791887908');
    fs.writeFileSync('download_resp.bin', res.buffer);
    console.log('Saved download_resp.bin, size:', res.buffer.length);
    if (res.headers['content-type'] && res.headers['content-type'].includes('text')) {
      console.log('First 500 chars:', res.buffer.toString('utf8').substring(0, 500));
    }
  } catch(e) {
    console.error('Error:', e);
  }
})();
