const https = require('https');

async function getPoster(ttId) {
  return new Promise((resolve) => {
    https.get('https://www.imdb.com/title/' + ttId + '/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        // Find JSON-LD or primary image
        const jsonLd = data.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
        if (jsonLd) {
          try {
            const parsed = JSON.parse(jsonLd[1]);
            if (parsed.image) return resolve(parsed.image);
          } catch(e) {}
        }
        const m = data.match(/https:\/\/m\.media-amazon\.com\/images\/M\/[^"'\s]+@\._V1_[^"'\s]*\.jpg/g);
        resolve(m ? m[0] : null);
      });
    }).on('error', () => resolve(null));
  });
}

(async () => {
  const p1 = await getPoster('tt26932238'); // Aranmanai 4
  console.log('Aranmanai 4 poster:', p1);

  // Search Anjaam Pathiraa
  const p2 = await getPoster('tt10714704'); // Anjaam Pathiraa
  console.log('Anjaam Pathiraa poster:', p2);
})();
