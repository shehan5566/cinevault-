/**
 * CineVault Super-Fast Direct Local Uploader (1-Hop MTProto Turbo 24X)
 * 
 * Usage:
 *   node fast_upload.js "C:\path\to\movie.mkv"
 *   node fast_upload.js "C:\path\to\movie.mkv" "C:\path\to\subtitle.srt"
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

const tgStorage = require('./tgstorage');
const { resolveStrict10CastWithPhotos } = require('./auto_cast_enricher');

const MOVIES_FILE = path.join(__dirname, 'data', 'movies.json');
const ACTOR_CACHE_FILE = path.join(__dirname, 'data', 'actor_cache.json');
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8538231781:AAFJ27AnEuZK22-TnUM15wRgYWdU2Zvihz0';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '-1003955449040';

function getMovies() {
  try {
    return JSON.parse(fs.readFileSync(MOVIES_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveMovies(movies) {
  fs.writeFileSync(MOVIES_FILE, JSON.stringify(movies, null, 2), 'utf8');
}

function cleanMovieTitleSmart(rawTitle) {
  if (!rawTitle) return { title: '', year: null };
  let str = rawTitle
    .replace(/\.[^/.]+$/, '')
    .replace(/[\._\-]/g, ' ')
    .replace(/baiscopedownloads\s*\.link|baiscopedownloads|baiscope\s*\.lk|baiscope|sinhalasub\s*\.lk|sinhalasub|cinesubz\s*\.co|cinesubz|yts\s*\.mx|yts\s*\.lt|yts|yify|rarbg|ettv|eztv|tgx|psa|fgt|sparks|galaxyrg|utr|ion10|pahe|1337x|torrent|link/gi, ' ')
    .replace(/\(.*?\)|\[.*?\]|\{.*?\}/g, ' ');

  let year = null;
  const yearMatch = str.match(/\b(19\d\d|20[0-3]\d)\b/);
  if (yearMatch) {
    year = parseInt(yearMatch[1]);
    str = str.replace(/\b(19\d\d|20[0-3]\d)\b/g, ' ');
  }

  str = str.replace(/\b(english|hindi|tamil|telugu|sinhala|malayalam|kannada|marathi|bengali|punjabi|gujarati|bhojpuri|urdu|korean|japanese|chinese|spanish|french|german|russian|italian|portuguese|arabic|turkish)\b/gi, ' ');
  str = str.replace(/\b(1080p|720p|480p|360p|2160p|4k|uhd|hdr|hdr10|bluray|blu-ray|webdl|web-dl|web|webrip|hdtvrip|hdtv|hdrip|dvdrip|dvd|brrip|bdrip|vhs|cam|hdcam|hdts|tc|hc|clean|line|mic|x264|x265|h264|h265|hevc|aac|ac3|dts|dd5\.1|dd7\.1|5\.1|7\.1|ch|xvid|divx|dl|unrated|uncut|extended|edition|proper|repack|remux|dsnp|nf|amzn|hmax|v2|v1|multi|dual|audio|dubbed|subbed|sub|esub|esubs|hq|lq|800mb|700mb|900mb|650mb|500mb|1gb|2gb)\b/gi, ' ');

  return { title: str.replace(/\s+/g, ' ').trim(), year };
}

function buildMovieCaption(movie, downloadLink) {
  const parts = [];
  parts.push(`🎬 <b>${movie.title}</b>${movie.sinhalaTitle ? ` (${movie.sinhalaTitle})` : ''}`);
  parts.push(`⭐ <b>IMDb:</b> ${movie.imdbRating || '7.5'}/10 | ⏳ <b>Duration:</b> ${movie.duration || '2h 10m'}`);
  parts.push(`🎭 <b>Genre:</b> ${Array.isArray(movie.genre) ? movie.genre.join(', ') : (movie.genre || 'Action, Drama')}`);
  parts.push(`🗣️ <b>Language:</b> ${movie.language || 'Tamil'} | 💿 <b>Quality:</b> ${movie.quality || 'WEB-DL'} (${movie.fileSize || '2.0 GB'})`);
  parts.push(`👤 <b>Director:</b> ${movie.director || 'Popular Director'}`);
  if (movie.cast && movie.cast.length > 0) {
    const castStr = Array.isArray(movie.cast) ? movie.cast.slice(0, 10).join(', ') : movie.cast;
    parts.push(`🌟 <b>Starring:</b> ${castStr}`);
  }
  if (downloadLink) {
    parts.push(`\n📥 <b>Direct Video Link:</b>\n<a href="${downloadLink}">${downloadLink}</a>`);
  }
  return parts.join('\n');
}

async function runFastUpload() {
  const videoInputPath = process.argv[2];
  const customSubPath = process.argv[3];

  if (!videoInputPath) {
    console.log('\n❌ Error: Please specify a movie file path!');
    console.log('Usage: node fast_upload.js "C:\\path\\to\\movie.mkv" ["C:\\path\\to\\sub.srt"]\n');
    process.exit(1);
  }

  if (!fs.existsSync(videoInputPath)) {
    console.log(`\n❌ Error: File not found: "${videoInputPath}"\n`);
    process.exit(1);
  }

  const stat = fs.statSync(videoInputPath);
  const sizeMB = (stat.size / (1024 * 1024)).toFixed(1);
  const sizeGB = (stat.size / (1024 * 1024 * 1024)).toFixed(2);
  const fileName = path.basename(videoInputPath);

  console.log('====================================================');
  console.log('⚡ CineVault Super-Fast Direct Local Uploader (24X Turbo)');
  console.log('====================================================');
  console.log(`📁 File: ${fileName} (${sizeGB} GB / ${sizeMB} MB)`);

  // 1. Detect title & year
  const cleaned = cleanMovieTitleSmart(fileName);
  const queryTitle = cleaned.title;
  const targetYear = cleaned.year;
  console.log(`🔍 Detected Title: "${queryTitle}" (Year: ${targetYear || 'Auto'})`);

  // 2. Resolve metadata & 10 Cast members
  console.log('🌐 Resolving 100% Studio Cast Portraits & 4K Poster...');
  let posterUrl = 'https://m.media-amazon.com/images/M/MV5BM2QzZTk5ODctYzcyOS00ZjJkLThlNmYtYWJlZDNmMTExYThiXkEyXkFqcGc@._V1_FMjpg_UX2500_.jpg';
  let director = 'Director';
  let genre = ['Action', 'Drama'];
  let imdbRating = 7.5;
  let cast = [];
  let castImages = {};
  let detectedYear = targetYear || 2024;
  let language = 'Tamil';

  try {
    const metaRes = await axios.get(`http://localhost:3000/api/fetch-metadata?title=${encodeURIComponent(queryTitle + (targetYear ? ' ' + targetYear : ''))}`, { timeout: 6000 });
    if (metaRes.data && metaRes.data.success) {
      const d = metaRes.data;
      if (d.posterUrl) posterUrl = d.posterUrl;
      if (d.director) director = d.director;
      if (d.genre) genre = typeof d.genre === 'string' ? d.genre.split(',').map(g => g.trim()) : d.genre;
      if (d.imdbRating) imdbRating = d.imdbRating;
      if (d.year) detectedYear = d.year;
      if (d.language) language = d.language;
      if (d.cast) {
        cast = typeof d.cast === 'string' ? d.cast.split(',').map(c => c.trim()) : d.cast;
      }
    }
  } catch (e) {
    console.log('Notice: Local server metadata fetch skipped, enriching directly...');
  }

  // Ensure strict 10 cast with studio photos
  const enriched = await resolveStrict10CastWithPhotos(queryTitle, detectedYear);
  if (enriched && enriched.cast && enriched.cast.length > 0) {
    cast = enriched.cast.slice(0, 10);
    castImages = enriched.castImages || {};
  }

  if (cast.length < 10) {
    console.log(`⚠️ Warning: Only found ${cast.length} cast members. Please verify cast count.`);
  }

  // 3. Subtitle handling & embedding
  let subPath = customSubPath;
  if (!subPath) {
    // Check for same-name subtitle in the same folder
    const baseWithoutExt = videoInputPath.replace(/\.[^/.]+$/, '');
    const possibleSubExts = ['.srt', '.vtt', '.sin.srt', '.sinhala.srt'];
    for (const ext of possibleSubExts) {
      if (fs.existsSync(baseWithoutExt + ext)) {
        subPath = baseWithoutExt + ext;
        break;
      }
    }
  }

  let finalWorkingVideoPath = videoInputPath;
  let isTempMuxed = false;

  if (subPath && fs.existsSync(subPath)) {
    console.log(`\n💬 Subtitle found: ${path.basename(subPath)}`);
    console.log('🔄 Embedding Sinhala Subtitle directly into video stream (Zero re-encoding)...');
    const ffmpegPath = require('ffmpeg-static');
    const muxedPath = path.join(__dirname, 'uploads', 'videos', `muxed_${Date.now()}.mkv`);
    fs.mkdirSync(path.join(__dirname, 'uploads', 'videos'), { recursive: true });

    try {
      await execAsync(`"${ffmpegPath}" -y -i "${videoInputPath}" -i "${subPath}" -map 0 -map 1:0 -c copy -c:s srt -metadata:s:s:0 language=sin -metadata:s:s:0 title="Sinhala Subtitle" "${muxedPath}"`);
      if (fs.existsSync(muxedPath) && fs.statSync(muxedPath).size > 1000) {
        finalWorkingVideoPath = muxedPath;
        isTempMuxed = true;
        console.log('✅ Subtitle successfully embedded!');
      }
    } catch (muxErr) {
      console.warn('Subtitle embed notice:', muxErr.message);
    }
  }

  // 4. Save metadata to movies.json immediately
  const movies = getMovies();
  const newMovie = {
    id: 'mov-' + Date.now(),
    title: queryTitle,
    sinhalaTitle: `${queryTitle} (Sinhala Subtitles)`,
    year: detectedYear,
    quality: '1080p WEB-DL',
    language,
    type: 'movie',
    hasSinhalaSub: !!subPath,
    genre,
    director,
    cast: cast.slice(0, 10),
    castImages,
    imdbRating,
    personalRating: imdbRating,
    notes: `${queryTitle} (${detectedYear}) Sinhala Subtitled Edition.`,
    duration: '2h 15m',
    fileSize: `${sizeGB} GB`,
    posterUrl,
    videoUrl: '',
    subtitleUrl: subPath ? `/uploads/subtitles/${path.basename(subPath)}` : '',
    telegramFileId: null,
    telegramMsgId: null,
    watched: false,
    isFavorite: false,
    inWatchlist: true,
    progressSeconds: 0,
    addedDate: new Date().toISOString()
  };

  movies.unshift(newMovie);
  saveMovies(movies);
  console.log(`\n💾 Saved "${newMovie.title}" immediately to database (Zero Data Loss).`);

  // 5. Post poster to Telegram Channel
  let telegramPhotoMsgId = null;
  try {
    const postCaption = buildMovieCaption(newMovie, null);
    const photoRes = await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
      chat_id: TELEGRAM_CHAT_ID,
      photo: posterUrl,
      caption: postCaption,
      parse_mode: 'HTML'
    });
    telegramPhotoMsgId = photoRes.data?.result?.message_id;
    console.log(`📸 Telegram Poster posted! (Message ID: ${telegramPhotoMsgId})`);
  } catch (err) {
    console.warn('Telegram photo post notice:', err.message);
  }

  // 6. Direct Turbo 24X MTProto Upload to Telegram Cloud
  console.log('\n🚀 Starting Telegram Cloud Upload with MTProto Turbo 24X...');
  const startTime = Date.now();
  let lastLoggedPct = 0;

  const up = await tgStorage.uploadFile(
    finalWorkingVideoPath,
    `${queryTitle} (${detectedYear}).mkv`,
    `🎬 ${newMovie.title} (${detectedYear})`,
    (p) => {
      const pct = Math.round(p * 100);
      if (pct >= lastLoggedPct + 5 || pct === 100) {
        const elapsed = (Date.now() - startTime) / 1000;
        const speedMBps = ((stat.size * p) / (1024 * 1024) / (elapsed || 1)).toFixed(1);
        process.stdout.write(`\r⚡ [Turbo 24X] ${pct}% uploaded • Speed: ${speedMBps} MB/s • Elapsed: ${Math.round(elapsed)}s    `);
        lastLoggedPct = pct;
      }
    }
  );

  console.log('\n');

  if (isTempMuxed && fs.existsSync(finalWorkingVideoPath)) {
    try { fs.unlinkSync(finalWorkingVideoPath); } catch (e) {}
  }

  if (up && up.messageId) {
    console.log(`✅ Upload Complete! Telegram Video File Message ID: ${up.messageId}`);
    const rawChatId = String(TELEGRAM_CHAT_ID).replace(/^-100/, '').replace(/^-/, '');
    const downloadLink = `https://t.me/c/${rawChatId}/${up.messageId}`;

    if (telegramPhotoMsgId) {
      try {
        const updatedCaption = buildMovieCaption(newMovie, downloadLink);
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageCaption`, {
          chat_id: TELEGRAM_CHAT_ID,
          message_id: telegramPhotoMsgId,
          caption: updatedCaption,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: '📥 Download / Watch Video', url: downloadLink }]]
          }
        });
        console.log('🔘 Interactive Telegram Download Button attached to poster!');
      } catch (e) {}
    }

    // Update movie in movies.json
    const updatedMovies = getMovies();
    const target = updatedMovies.find(m => m.id === newMovie.id);
    if (target) {
      target.telegramMsgId = up.messageId;
      target.videoUrl = `/api/telegram/file/${up.messageId}`;
      saveMovies(updatedMovies);
    }

    console.log('\n🎉 ALL DONE! The movie is live in your CineVault Library.');
    console.log('Git auto-sync will now deploy the update to Render within 60 seconds.');
  } else {
    console.log('❌ Telegram upload failed or was canceled.');
  }
}

runFastUpload().catch(err => {
  console.error('\nFatal Error during fast upload:', err.message);
});
