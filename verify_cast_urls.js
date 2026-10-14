const axios = require('axios');

const cast10 = {
  "Karthik Raju": "https://images.filmibeat.com/popcorn/og-images/karthik-raju-35197-og.jpg",
  "Simran Choudhary": "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5a/Simran_Choudhary_Purple.jpg/960px-Simran_Choudhary_Purple.jpg",
  "Ayraa": "https://images.filmibeat.com/popcorn/og-images/ayraa-50459-og.jpg",
  "Arvind Krishna": "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/98/Actor_Arvind_in_2025.jpg/960px-Actor_Arvind_in_2025.jpg",
  "Kabir Duhan Singh": "https://upload.wikimedia.org/wikipedia/commons/5/51/KabirDuhan_Singh.jpg",
  "Kalpika Ganesh": "https://images.filmibeat.com/popcorn/og-images/kalpika-ganesh-43850-og.jpg",
  "G. Marimuthu": "https://images.filmibeat.com/popcorn/og-images/marimuthu-31717-og.jpg",
  "Gagan Vihari": "https://upload.wikimedia.org/wikipedia/commons/d/d4/Gagan.jpg",
  "Shiva": "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/52/Bangalore_Shiva.jpg/960px-Bangalore_Shiva.jpg",
  "Kiran Macha": "https://images.filmibeat.com/img/popcorn/profile_photos/kiran-macha-20260918171022-57366.jpg"
};

async function verifyAll() {
  for (const [name, url] of Object.entries(cast10)) {
    try {
      const res = await axios.head(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        timeout: 5000
      });
      console.log(`[OK ${res.status}] ${name} -> ${res.headers['content-type']} (${res.headers['content-length']} bytes)`);
    } catch(e) {
      console.log(`[FAIL] ${name} -> ${e.message}`);
    }
  }
}

verifyAll();
