const https = require('https');
const http = require('http');

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
  try {
    const html = await fetchUrl('https://piratelk.com/atharva-2023-sinhala-subtitles/');
    // find buttons or download links in the content
    const re = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      const href = m[1];
      const text = m[2].replace(/<[^>]+>/g, '').trim();
      if (/download|බාගන්න|zip|rar|sub/i.test(text) || /download|drive\.google|mediafire|mega\.nz|\.zip/i.test(href)) {
        console.log('Match:', text, '=>', href);
      }
    }
  } catch(e) {
    console.error('Error:', e);
  }
})();
