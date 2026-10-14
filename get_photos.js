const axios = require('axios');

async function scrape(url, name) {
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 8000
    });
    const imgMatches = res.data.match(/https?:\/\/[^"'<>\s]+\.(jpg|jpeg|png|webp)/gi) || [];
    const filtered = imgMatches.filter(u => !u.includes('logo') && !u.includes('banner') && !u.includes('icon') && !u.includes('footer'));
    console.log(`=== ${name} ===`);
    console.log(filtered.slice(0, 5));
  } catch(e) {
    console.log(name, 'error:', e.message);
  }
}

async function main() {
  await scrape('https://www.ragalahari.com/actor/karthik-raju.aspx', 'Karthik Raju');
  await scrape('https://www.ragalahari.com/actress/kalpika-ganesh.aspx', 'Kalpika Ganesh');
  await scrape('https://www.ragalahari.com/actress/ayraa.aspx', 'Ayraa');
}

main();
