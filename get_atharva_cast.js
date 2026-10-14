const axios = require('axios');
const fs = require('fs');

async function getActorImage(actorName) {
  try {
    // 1. Try Wikipedia pageimages
    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(actorName)}&prop=pageimages&format=json&pithumbsize=600`;
    const res = await axios.get(url, { headers: { 'User-Agent': 'CineVault/1.0' }, timeout: 5000 });
    const pages = res.data?.query?.pages || {};
    for (const pid in pages) {
      if (pages[pid]?.thumbnail?.source) {
        return pages[pid].thumbnail.source;
      }
    }
  } catch (e) {}

  try {
    // 2. Try Wikipedia search + pageimages
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(actorName + ' actor')}&gsrlimit=3&prop=pageimages&pithumbsize=600&format=json`;
    const sRes = await axios.get(searchUrl, { headers: { 'User-Agent': 'CineVault/1.0' }, timeout: 5000 });
    const pages = sRes.data?.query?.pages || {};
    for (const pid in pages) {
      if (pages[pid]?.thumbnail?.source) {
        return pages[pid].thumbnail.source;
      }
    }
  } catch (e) {}

  return null;
}

const actors = [
  'Karthik Raju',
  'Simran Choudhary',
  'Ayraa',
  'Shiva',
  'Arvind Krishna (actor)',
  'Kabir Duhan Singh',
  'Gagan Vihari',
  'Kalpika Ganesh',
  'G. Marimuthu',
  'Anand (actor)'
];

async function run() {
  const results = {};
  for (const a of actors) {
    const img = await getActorImage(a);
    console.log(`${a}: ${img}`);
    results[a] = img;
  }
}

run();
