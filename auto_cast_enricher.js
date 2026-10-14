const axios = require('axios');
const fs = require('fs');
const path = require('path');

const ACTOR_CACHE_FILE = path.join(__dirname, 'data', 'actor_cache.json');

function getActorCache() {
  try {
    if (fs.existsSync(ACTOR_CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(ACTOR_CACHE_FILE, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function saveActorCache(cache) {
  try {
    fs.writeFileSync(ACTOR_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
  } catch (e) {}
}

/**
 * Automatically extracts the official strictly 10 cast members for any movie
 * and resolves high-definition official studio photoshoot portraits from Wikimedia Commons / Wikipedia.
 */
async function resolveStrict10CastWithPhotos(movieTitle, movieYear = null) {
  try {
    const cleanTitle = (movieTitle || '').replace(/\(\d{4}\)/g, '').trim();
    const query = `${cleanTitle} ${movieYear || ''} film`.trim();

    // 1. Search Wikipedia for the movie's main article
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json`;
    const searchRes = await axios.get(searchUrl, {
      timeout: 8000,
      headers: { 'User-Agent': 'CineVaultMovieLibrary/1.0 (contact@cinevault.lk)' }
    });

    const searchResults = searchRes.data?.query?.search || [];
    const topResult = searchResults[0];
    if (!topResult) return null;

    // 2. Parse the article wikitext to extract the Cast section
    const parseUrl = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(topResult.title)}&prop=wikitext&format=json`;
    const parseRes = await axios.get(parseUrl, {
      timeout: 8000,
      headers: { 'User-Agent': 'CineVaultMovieLibrary/1.0 (contact@cinevault.lk)' }
    });

    const wikitext = parseRes.data?.parse?.wikitext?.['*'] || '';
    const castIndex = wikitext.indexOf('== Cast ==');
    if (castIndex === -1) return null;

    const castChunk = wikitext.slice(castIndex, castIndex + 8000);
    const lines = castChunk.split('\n');
    const candidates = [];

    for (const line of lines) {
      if (line.startsWith('==') && line !== '== Cast ==') break;
      // Match [[Actor Name]] or plain Actor Name before 'as'
      const match = line.match(/^\*\s*(?:\[\[([^\]|]+)(?:\|[^\]]+)?\]\]|([A-Z][a-zA-Z\s\.\-]+?)\s+as\s)/);
      if (match) {
        const rawName = (match[1] || match[2] || '').trim();
        // Ignore roles or metadata tags
        if (
          rawName &&
          !/young|rank|dual|role|cameo|special|voice|uncredited|himself|herself/i.test(rawName) &&
          !candidates.includes(rawName)
        ) {
          candidates.push(rawName);
        }
      }
    }

    if (candidates.length === 0) return null;

    // 3. Batch query Wikimedia Commons for high-definition studio portraits
    const titlesQuery = candidates.slice(0, 30).map(c => encodeURIComponent(c)).join('|');
    const imageRes = await axios.get(
      `https://en.wikipedia.org/w/api.php?action=query&titles=${titlesQuery}&prop=pageimages&format=json&pithumbsize=600`,
      {
        timeout: 8000,
        headers: { 'User-Agent': 'CineVaultMovieLibrary/1.0 (contact@cinevault.lk)' }
      }
    );

    const pages = imageRes.data?.query?.pages || {};
    const photoMap = {};
    Object.values(pages).forEach(p => {
      if (p.title && p.thumbnail?.source) {
        photoMap[p.title] = p.thumbnail.source;
      }
    });

    // Check existing actor cache as secondary source
    const existingCache = getActorCache();
    candidates.forEach(c => {
      if (!photoMap[c] && (existingCache[c] || existingCache[c.toLowerCase()])) {
        photoMap[c] = existingCache[c] || existingCache[c.toLowerCase()];
      }
    });

    // Prioritize actors who have high-definition studio portraits
    const withPhoto = candidates.filter(c => !!photoMap[c]);
    const withoutPhoto = candidates.filter(c => !photoMap[c]);

    const final10 = withPhoto.slice(0, 10);
    if (final10.length < 10) {
      const needed = 10 - final10.length;
      final10.push(...withoutPhoto.slice(0, needed));
    }

    // Ensure strictly exactly 10 members
    const finalCast = final10.slice(0, 10);
    const finalImages = {};

    finalCast.forEach(actor => {
      const img = photoMap[actor] || '';
      finalImages[actor] = img;
      if (img) {
        existingCache[actor] = img;
        existingCache[actor.toLowerCase()] = img;
      }
    });

    saveActorCache(existingCache);

    return {
      cast: finalCast,
      castImages: finalImages
    };
  } catch (err) {
    console.error(`[AutoCastEnricher] Error resolving cast for "${movieTitle}":`, err.message);
    return null;
  }
}

module.exports = {
  resolveStrict10CastWithPhotos
};
