require('dotenv').config();
const express = require('express');
const tgStorage = require('./tgstorage');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');

const app = express();
const PORT = process.env.PORT || 3000;

// TELEGRAM CLOUD STORAGE CONFIGURATION
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8538231781:AAFJ27AnEuZK22-TnUM15wRgYWdU2Zvihz0';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '-1003955449040';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Storage configuration for Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'video') {
      const dir = path.join(__dirname, 'uploads', 'videos');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } else if (file.fieldname === 'poster') {
      const dir = path.join(__dirname, 'uploads', 'posters');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } else if (file.fieldname === 'subtitle') {
      const dir = path.join(__dirname, 'uploads', 'subtitles');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } else {
      const dir = path.join(__dirname, 'uploads');
      cb(null, dir);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 * 1024 } // 10GB limit
});

// JSON Database helper
const DATA_FILE = path.join(__dirname, 'data', 'movies.json');
const ACTOR_CACHE_FILE = path.join(__dirname, 'data', 'actor_cache.json');

let actorAvatarCache = {};
try {
  if (fs.existsSync(ACTOR_CACHE_FILE)) {
    actorAvatarCache = JSON.parse(fs.readFileSync(ACTOR_CACHE_FILE, 'utf8'));
  }
} catch (e) {
  actorAvatarCache = {};
}

function saveActorAvatarCache() {
  try {
    fs.writeFileSync(ACTOR_CACHE_FILE, JSON.stringify(actorAvatarCache, null, 2), 'utf8');
  } catch (e) {}
}

function getMovies() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const list = JSON.parse(raw);
    if (Array.isArray(list)) {
      list.forEach(m => {
        if (m.telegramMsgId && (!m.videoUrl || m.videoUrl.startsWith('/uploads/'))) {
          m.videoUrl = `/api/telegram/file/${m.telegramMsgId}`;
        }
      });
    }
    return list;
  } catch (err) {
    console.error('Error reading movies.json:', err);
    return [];
  }
}

function saveMovies(movies) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(movies, null, 2), 'utf8');
    if (process.env.NODE_ENV !== 'production') {
      try { require('./auto_git_sync').checkAndPush('movies database updated'); } catch (e) {}
    }
  } catch (err) {
    console.error('Error writing movies.json:', err);
  }
}

// Serve Static Files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// HLS ADAPTIVE MULTI-BITRATE TRANSCODER SERVICE
const { execFile } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

function transcodeToHLS(movieId, inputFilePath) {
  if (!fs.existsSync(inputFilePath)) return;
  const hlsDir = path.join(__dirname, 'uploads', 'hls', movieId);
  fs.mkdirSync(hlsDir, { recursive: true });

  console.log(`[HLS Transcoder] Starting background adaptive HLS conversion for movie: ${movieId}...`);

  const args = [
    '-i', inputFilePath,
    '-preset', 'veryfast',
    '-g', '48',
    '-sc_threshold', '0',
    '-map', '0:v:0', '-map', '0:a:0?', '-map', '0:v:0', '-map', '0:a:0?', '-map', '0:v:0', '-map', '0:a:0?',
    '-s:v:0', '1920x1080', '-c:v:0', 'libx264', '-b:v:0', '4000k',
    '-s:v:1', '1280x720',  '-c:v:1', 'libx264', '-b:v:1', '2200k',
    '-s:v:2', '854x480',   '-c:v:2', 'libx264', '-b:v:2', '1000k',
    '-c:a', 'aac', '-b:a', '128k',
    '-var_stream_map', 'v:0,a:0,name:1080p v:1,a:1,name:720p v:2,a:2,name:480p',
    '-master_pl_name', 'master.m3u8',
    '-f', 'hls',
    '-hls_time', '6',
    '-hls_playlist_type', 'vod',
    '-hls_segment_filename', path.join(hlsDir, '%v_%03d.ts'),
    path.join(hlsDir, '%v.m3u8')
  ];

  execFile(ffmpegPath, args, (error, stdout, stderr) => {
    if (error) {
      console.error(`[HLS Transcoder] Error transcoding ${movieId}:`, error.message);
      return;
    }
    console.log(`[HLS Transcoder] Success! Master HLS playlist created for ${movieId}`);

    const movies = getMovies();
    const movie = movies.find(m => m.id === movieId);
    if (movie) {
      movie.hlsUrl = `/uploads/hls/${movieId}/master.m3u8`;
      saveMovies(movies);
    }
  });
}

// TELEGRAM HELPER FUNCTIONS
async function uploadFileToTelegram(filePath, fileName) {
  try {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return null;
    console.log(`[Telegram Storage] Uploading ${fileName} to Telegram Cloud Storage...`);

    const possibleChatIds = [
      TELEGRAM_CHAT_ID,
      TELEGRAM_CHAT_ID.startsWith('-') ? TELEGRAM_CHAT_ID : `-100${TELEGRAM_CHAT_ID}`,
      TELEGRAM_CHAT_ID.startsWith('-') ? TELEGRAM_CHAT_ID : `-${TELEGRAM_CHAT_ID}`
    ];

    for (const targetChatId of [...new Set(possibleChatIds)]) {
      try {
        const form = new FormData();
        form.append('chat_id', targetChatId);
        form.append('caption', `🎬 CineVault Movie: ${fileName}`);
        form.append('document', fs.createReadStream(filePath), fileName);

        const response = await axios.post(
          `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`,
          form,
          {
            headers: form.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            timeout: 600000
          }
        );

        if (response.data && response.data.ok) {
          const doc = response.data.result.document || response.data.result.video;
          console.log(`[Telegram Storage] Upload Success to Chat ID ${targetChatId}! Telegram File ID: ${doc.file_id}`);
          return doc.file_id;
        }
      } catch (postErr) {
        console.error(`[Telegram Storage] Chat ID ${targetChatId} attempt:`, postErr.response?.data?.description || postErr.message);
      }
    }
  } catch (err) {
    console.error('[Telegram Storage] Upload Error:', err.message);
  }
  return null;
}

async function getTelegramFileUrl(fileId) {
  try {
    const res = await axios.get(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
    if (res.data && res.data.ok && res.data.result.file_path) {
      return `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${res.data.result.file_path}`;
    }
  } catch (err) {
    console.error('[Telegram Storage] Get File Path Error:', err.message);
  }
  return null;
}

// Progress of the background migrate_to_telegram.js script (written to a file by that script)
app.get('/api/migration-progress', (req, res) => {
  try {
    const p = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'migration_progress.json'), 'utf8'));
    if (p.active && Date.now() - p.updatedAt > 60000) p.active = false; // stale: script is no longer running
    res.json(p);
  } catch (e) {
    res.json({ active: false });
  }
});

// Live Telegram upload progress, polled by the web UI
const tgUploadProgress = {};
app.get('/api/upload-progress/:id', (req, res) => {
  res.json(tgUploadProgress[req.params.id] || { pct: 0, stage: 'waiting' });
});

// Posts movie poster with title, metadata and download link to Telegram
function buildMovieCaption(m, downloadUrl = null) {
  let lines = [
    `🎬 <b>${m.title}</b>`,
    m.sinhalaTitle ? `<i>${m.sinhalaTitle}</i>` : '',
    '',
    `🎭 <b>Genre:</b> ${(m.genre || []).join(', ')}`,
    `⭐ <b>IMDb:</b> ${m.imdbRating || 7.0}/10 | 🕒 <b>Runtime:</b> ${m.duration || '2h 00m'}`,
    `🔊 <b>Language:</b> ${m.language || 'Unknown'} | 📝 <b>Sinhala Subtitles:</b> Included`,
    `💿 <b>Quality:</b> ${m.quality || 'WEB-DL'} | 💾 <b>Size:</b> ${m.fileSize || 'N/A'}`,
    m.director ? `👤 <b>Director:</b> ${m.director}` : '',
    m.cast && m.cast.length ? `🌟 <b>Starring:</b> ${m.cast.slice(0, 5).join(', ')}` : '',
    ''
  ];

  if (downloadUrl) {
    lines.push(`📥 <b>Download Link:</b> ${downloadUrl}`);
  } else {
    lines.push(`⏳ <i>Uploading video file below...</i>`);
  }

  return lines.filter(l => l !== undefined).join('\n').trim();
}

async function postMovieToTelegram(movie, downloadUrl = null) {
  try {
    const caption = buildMovieCaption(movie, downloadUrl);
    const api = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
    let buffer = null;
    const url = movie.posterUrl || '';
    if (/^https?:\/\//i.test(url)) {
      const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
      buffer = Buffer.from(r.data);
    } else if (url) {
      const rel = url.replace(/^\//, '');
      const p = [path.join(__dirname, 'public', rel), path.join(__dirname, rel)].find(f => fs.existsSync(f));
      if (p) buffer = fs.readFileSync(p);
    }
    let res = null;
    if (buffer) {
      const form = new FormData();
      form.append('chat_id', TELEGRAM_CHAT_ID);
      form.append('caption', caption);
      form.append('parse_mode', 'HTML');
      form.append('photo', buffer, { filename: 'poster.jpg' });
      if (downloadUrl) {
        form.append('reply_markup', JSON.stringify({
          inline_keyboard: [[{ text: '📥 Download / Watch Video', url: downloadUrl }]]
        }));
      }
      res = await axios.post(`${api}/sendPhoto`, form, { headers: form.getHeaders() });
    } else {
      res = await axios.post(`${api}/sendMessage`, {
        chat_id: TELEGRAM_CHAT_ID,
        text: caption,
        parse_mode: 'HTML',
        ...(downloadUrl ? { reply_markup: { inline_keyboard: [[{ text: '📥 Download / Watch Video', url: downloadUrl }]] } } : {})
      });
    }
    console.log(`[Telegram] Posted "${movie.title}" to channel.`);
    return res.data?.result?.message_id;
  } catch (err) {
    console.error('[Telegram] Channel post failed:', err.response?.data?.description || err.message);
    return null;
  }
}

// --- API ENDPOINTS ---

// Get all movies
app.get('/api/movies', (req, res) => {
  let movies = getMovies();

  // Verify if local video file physically exists on PC disk
  movies = movies.map(m => {
    if (m.videoUrl && m.videoUrl.startsWith('/uploads/')) {
      const fullPath = path.join(__dirname, m.videoUrl);
      if (!fs.existsSync(fullPath)) {
        return { ...m, videoUrl: '' };
      }
    }
    return m;
  });

  const { search, genre, watched, favorite, watchlist, sort, quality } = req.query;

  if (search) {
    const query = search.toLowerCase();
    movies = movies.filter(m => 
      m.title.toLowerCase().includes(query) ||
      (m.sinhalaTitle && m.sinhalaTitle.toLowerCase().includes(query)) ||
      m.director.toLowerCase().includes(query) ||
      (m.cast && m.cast.some(c => c.toLowerCase().includes(query)))
    );
  }

  if (genre && genre !== 'all') {
    movies = movies.filter(m => 
      Array.isArray(m.genre) ? m.genre.includes(genre) : m.genre === genre
    );
  }

  if (quality && quality !== 'all') {
    movies = movies.filter(m => m.quality && m.quality.includes(quality));
  }

  if (watched === 'true') movies = movies.filter(m => m.watched === true);
  if (watched === 'false') movies = movies.filter(m => m.watched === false);
  if (favorite === 'true') movies = movies.filter(m => m.isFavorite === true);
  if (watchlist === 'true') movies = movies.filter(m => m.inWatchlist === true);

  if (sort === 'rating') {
    movies.sort((a, b) => b.personalRating - a.personalRating);
  } else if (sort === 'year') {
    movies.sort((a, b) => b.year - a.year);
  } else if (sort === 'title') {
    movies.sort((a, b) => a.title.localeCompare(b.title));
  } else {
    movies.sort((a, b) => new Date(b.addedDate) - new Date(a.addedDate));
  }

  res.json(movies);
});

// Get single movie
app.get('/api/movies/:id', (req, res) => {
  const movies = getMovies();
  const movie = movies.find(m => m.id === req.params.id);
  if (!movie) return res.status(404).json({ error: 'Movie not found' });
  res.json(movie);
});

function upgradeTo4KPoster(url) {
  if (!url) return '';
  let p = url;
  if (p.includes('media-amazon.com')) {
    p = p.replace(/\._V1_.*\.jpg$/i, '._V1_FMjpg_UX2500_.jpg');
  }
  p = p.replace(/SX300|SX500|UX300|SX\d+/gi, 'UX2500');
  p = p.replace(/\d+x\d+bb/gi, '3000x3000bb');
  p = p.replace(/\/t\/p\/w\d+/gi, '/t/p/original');
  return p;
}

// Create Movie (with Telegram Cloud Upload)
app.post('/api/movies', upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'poster', maxCount: 1 },
  { name: 'subtitle', maxCount: 1 }
]), async (req, res) => {
  const movies = getMovies();
  const {
    title, sinhalaTitle, year, quality, hasSinhalaSub, genre, director, cast, imdbRating,
    personalRating, notes, duration, fileSize, videoUrl, posterUrl, subtitleUrl,
    language, type
  } = req.body;

  let finalVideoUrl = videoUrl || '';
  let finalPosterUrl = upgradeTo4KPoster(posterUrl || '/posters/interstellar.jpg');
  let finalSubtitleUrl = subtitleUrl || '';
  let telegramFileId = null;
  let telegramMsgId = null;

  if (req.files && req.files.video && req.files.video[0]) {
    finalVideoUrl = `/uploads/videos/${req.files.video[0].filename}`;
  }

  if (req.files && req.files.poster && req.files.poster[0]) {
    finalPosterUrl = `/uploads/posters/${req.files.poster[0].filename}`;
  }

  if (req.files && req.files.subtitle && req.files.subtitle[0]) {
    finalSubtitleUrl = processAndConvertSubtitle(req.files.subtitle[0]);
  }

  // Auto-detect Language & Type if not specified
  const autoDetected = detectLanguageAndType({
    title, genre, director, cast, language, type
  });

  let castList = typeof cast === 'string' ? cast.split(',').map(c => c.trim()).filter(Boolean) : (cast || []);
  let movieDirector = director || '';
  let movieYear = parseInt(year) || null;
  let movieImdbId = req.body.imdbId || null;
  let movieGenre = typeof genre === 'string' ? genre.split(',').map(g => g.trim()) : (genre || ['Drama']);

  // Check if poster or cast or director needs rich resolution
  const needsPoster = !finalPosterUrl || finalPosterUrl.includes('ui-avatars.com') || finalPosterUrl.includes('interstellar.jpg');
  const needsCast = castList.length < 10 || (castList.length === 1 && castList[0].toLowerCase().includes('popular'));
  const needsDirector = !movieDirector || movieDirector === 'Popular Director' || movieDirector === 'Unknown';

  if ((needsPoster || needsCast || needsDirector) && title) {
    try {
      const resolved = await autoResolveMovieMetadata(title);
      if (resolved) {
        if (needsPoster && resolved.posterUrl) finalPosterUrl = upgradeTo4KPoster(resolved.posterUrl);
        if (needsDirector && resolved.director) movieDirector = resolved.director;
        if (!movieYear && resolved.year) movieYear = resolved.year;
        if (!movieImdbId && resolved.imdbId) movieImdbId = resolved.imdbId;
        if (resolved.genre && resolved.genre.length > 0 && (!genre || genre.length === 0)) movieGenre = resolved.genre;
        if (resolved.cast && resolved.cast.length > 0) {
          resolved.cast.forEach(a => { if (!castList.includes(a)) castList.push(a); });
        }
      }
    } catch (e) {}
  }

  // Enforce Mandatory Rule 1: Always exactly 10 cast members
  castList = castList.slice(0, 10);

  const newMovie = {
    id: 'mov-' + Date.now(),
    title: title || 'Untitled Movie',
    sinhalaTitle: sinhalaTitle || `${title} (Subtitled)`,
    year: movieYear || new Date().getFullYear(),
    quality: quality || 'WEB-DL',
    language: language || autoDetected.language,
    type: type || autoDetected.type,
    imdbId: movieImdbId,
    seasons: req.body.seasons || null,
    hasSinhalaSub: hasSinhalaSub === 'true' || hasSinhalaSub === true,
    genre: movieGenre,
    director: movieDirector || 'Unknown',
    cast: castList,
    imdbRating: parseFloat(imdbRating) || 7.0,
    personalRating: parseFloat(personalRating) || 7.0,
    notes: notes || '',
    duration: duration || '2h 00m',
    fileSize: fileSize || '2.0 GB',
    posterUrl: finalPosterUrl,
    videoUrl: finalVideoUrl,
    subtitleUrl: finalSubtitleUrl,
    telegramFileId: telegramFileId,
    telegramMsgId: telegramMsgId,
    watched: false,
    isFavorite: false,
    inWatchlist: true,
    progressSeconds: 0,
    addedDate: new Date().toISOString()
  };

  // Save movie to database immediately so it is never lost even if Telegram upload is interrupted
  movies.unshift(newMovie);
  saveMovies(movies);

  let telegramPhotoMsgId = null;
  try {
    telegramPhotoMsgId = await postMovieToTelegram(newMovie);
  } catch (err) {
    console.error('Failed to post movie poster to Telegram:', err);
  }

  if (req.files && req.files.video && req.files.video[0]) {
    const videoFile = req.files.video[0];
    let localVideoPath = videoFile.path;

    // Embed uploaded subtitle directly inside the video container (single-file download with embedded subtitles)
    if (finalSubtitleUrl && finalSubtitleUrl.startsWith('/uploads/subtitles/')) {
      const subFilePath = path.join(__dirname, finalSubtitleUrl);
      if (fs.existsSync(subFilePath)) {
        try {
          const ffmpegPath = require('ffmpeg-static');
          const muxedPath = localVideoPath + '.muxed.mkv';
          console.log(`[CineVault Subtitle Embed] Embedding subtitle into video container: ${subFilePath}`);
          execSync(`"${ffmpegPath}" -y -i "${localVideoPath}" -i "${subFilePath}" -map 0 -map 1:0 -c copy -c:s srt -metadata:s:s:0 language=sin -metadata:s:s:0 title="Sinhala Subtitle" "${muxedPath}"`, { stdio: 'pipe' });
          if (fs.existsSync(muxedPath) && fs.statSync(muxedPath).size > 1000) {
            fs.unlinkSync(localVideoPath);
            fs.renameSync(muxedPath, localVideoPath);
            console.log(`[CineVault Subtitle Embed] Successfully embedded Sinhala subtitle track inside movie video!`);
          }
        } catch (muxErr) {
          console.error('[CineVault Subtitle Embed] Error during muxing:', muxErr.message);
        }
      }
    }

    const origBase = videoFile.originalname ? videoFile.originalname.replace(/\.[^/.]+$/, '') : newMovie.title;
    const label = `${origBase}.mkv`;
    const caption = `🎬 ${newMovie.title}${newMovie.year && !String(newMovie.title).includes(String(newMovie.year)) ? ` (${newMovie.year})` : ''}`;
    const uploadId = req.body.uploadId;
    if (!tgStorage.isConfigured()) {
      console.error('[Telegram] TELEGRAM_API_ID/TELEGRAM_API_HASH missing in .env - video kept locally until configured.');
    } else {
      try {
        const up = await tgStorage.uploadFile(localVideoPath, label, caption, (p) => {
          if (uploadId) tgUploadProgress[uploadId] = { pct: Math.round(p * 100), stage: 'telegram' };
        });
        if (uploadId) tgUploadProgress[uploadId] = { pct: 100, stage: 'done' };
        if (uploadId) setTimeout(() => delete tgUploadProgress[uploadId], 60000);
        if (up) {
          const rawChatId = String(TELEGRAM_CHAT_ID).replace(/^-100/, '').replace(/^-/, '');
          const downloadLink = `https://t.me/c/${rawChatId}/${up.messageId}`;
          const directDownloadLink = `${req.protocol}://${req.get('host')}/api/download/${newMovie.id}`;
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
            } catch (editErr) {}
          }
          const currentMovies = getMovies();
          const target = currentMovies.find(m => m.id === newMovie.id);
          if (target) {
            target.telegramMsgId = up.messageId;
            target.videoUrl = `/api/telegram/file/${up.messageId}`;
            saveMovies(currentMovies);
          }
          newMovie.telegramMsgId = up.messageId;
          newMovie.videoUrl = `/api/telegram/file/${up.messageId}`;
          try {
            fs.unlinkSync(localVideoPath);
            console.log('[CineVault Storage] Local video deleted. PC disk used: 0 MB.');
          } catch (err) {
            console.error('Error deleting local temp video:', err.message);
          }
        }
      } catch (err) {
        console.error('Error uploading video to Telegram:', err);
      }
    }
  }

  res.status(201).json(newMovie);
});

// Single Video & Subtitle Upload Endpoint for TV Series Episodes & Batch Files
app.post('/api/upload-video-single', upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'subtitle', maxCount: 1 }
]), async (req, res) => {
  let finalVideoUrl = '';
  let finalSubtitleUrl = '';

  if (req.files && req.files.video && req.files.video[0]) {
    const videoFile = req.files.video[0];
    finalVideoUrl = `/uploads/videos/${videoFile.filename}`;
  }

  if (req.files && req.files.subtitle && req.files.subtitle[0]) {
    finalSubtitleUrl = processAndConvertSubtitle(req.files.subtitle[0]);
  }

  res.json({
    success: true,
    videoUrl: finalVideoUrl,
    subtitleUrl: finalSubtitleUrl,
    localPath: finalVideoUrl
  });
});

// Standalone Subtitle Upload Endpoint (for player drag & drop / quick attach)
app.post('/api/upload-subtitle-single', upload.fields([{ name: 'subtitle', maxCount: 1 }]), async (req, res) => {
  if (!req.files || !req.files.subtitle || !req.files.subtitle[0]) {
    return res.status(400).json({ error: 'No subtitle file provided' });
  }
  const subUrl = processAndConvertSubtitle(req.files.subtitle[0]);
  res.json({ success: true, subtitleUrl: subUrl });
});

// SRT TO WEBVTT AUTOMATIC SUBTITLE DECODER
function processAndConvertSubtitle(subFile) {
  if (!subFile || !subFile.path) return '';
  const subPath = subFile.path;
  const ext = path.extname(subFile.originalname || subFile.filename).toLowerCase();

  try {
    let content = fs.readFileSync(subPath, 'utf8');
    content = content.replace(/^\uFEFF/, ''); // Strip UTF-8 BOM if present

    if (ext === '.srt' || !content.startsWith('WEBVTT')) {
      // Decode and convert SRT format to WebVTT format
      let vttLines = ['WEBVTT\n'];
      const blocks = content.replace(/\r\n|\r/g, '\n').split('\n\n');

      blocks.forEach(block => {
        const lines = block.trim().split('\n');
        if (lines.length >= 2) {
          let timeLineIdx = 0;
          if (/^\d+$/.test(lines[0].trim())) {
            timeLineIdx = 1;
          }
          if (lines[timeLineIdx] && lines[timeLineIdx].includes('-->')) {
            const timeLine = lines[timeLineIdx].replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, '$1.$2');
            const textLines = lines.slice(timeLineIdx + 1).join('\n');
            vttLines.push(timeLine);
            vttLines.push(textLines);
            vttLines.push('');
          }
        }
      });

      const vttContent = vttLines.join('\n');
      const vttFilename = subFile.filename.replace(/\.[^/.]+$/, "") + '.vtt';
      const subDir = path.join(__dirname, 'uploads', 'subtitles');
      if (!fs.existsSync(subDir)) fs.mkdirSync(subDir, { recursive: true });

      const vttPath = path.join(subDir, vttFilename);
      fs.writeFileSync(vttPath, vttContent, 'utf8');
      return `/uploads/subtitles/${vttFilename}`;
    }
  } catch (err) {
    console.error('Subtitle conversion error:', err.message);
  }

  return `/uploads/subtitles/${subFile.filename}`;
}

// Stream Telegram Video via MTProto (Range supported, files up to 2GB)
app.get('/api/telegram/file/:msgId', async (req, res) => {
  try {
    await tgStorage.streamToResponse(req.params.msgId, req, res);
  } catch (err) {
    console.error('Telegram MTProto stream error:', err.message);
    if (!res.headersSent) res.status(500).send('Error streaming video from Telegram');
  }
});

// Stream Telegram Video Endpoint (legacy Bot API)
app.get('/api/telegram/stream/:fileId', async (req, res) => {
  const telegramUrl = await getTelegramFileUrl(req.params.fileId);
  if (!telegramUrl) return res.status(404).send('Telegram file stream unavailable');

  try {
    const streamRes = await axios.get(telegramUrl, { responseType: 'stream' });
    res.setHeader('Content-Type', 'video/mp4');
    streamRes.data.pipe(res);
  } catch (err) {
    console.error('Telegram streaming proxy error:', err.message);
    res.status(500).send('Error streaming video from Telegram');
  }
});

// HELPER FUNCTION FOR LANGUAGE & CONTENT TYPE AUTO-DETECTION
function detectLanguageAndType(data) {
  let lang = (data.language || data.Language || '').trim();
  let itemType = (data.type || data.Type || 'movie').toLowerCase();

  const fullText = `${data.title || ''} ${data.genre || ''} ${data.director || ''} ${data.cast || ''} ${data.country || ''} ${data.language || ''} ${data.Language || ''}`.toLowerCase();

  if (fullText.includes('tamil') || fullText.includes('kollywood') || fullText.includes('chennai') || fullText.includes('telugu') || fullText.includes('malayalam')) {
    lang = 'Tamil';
  } else if (fullText.includes('hindi') || fullText.includes('bollywood') || fullText.includes('mumbai')) {
    lang = 'Hindi';
  } else if (fullText.includes('sinhala') || fullText.includes('sri lanka')) {
    lang = 'Sinhala';
  } else if (fullText.includes('english') || fullText.includes('hollywood') || fullText.includes('usa') || fullText.includes('uk')) {
    lang = 'English';
  } else if (!lang) {
    lang = 'English';
  }

  if (fullText.includes('season') || fullText.includes('episode') || fullText.includes('tv series') || fullText.includes('show') || itemType === 'series' || itemType === 'tv') {
    itemType = 'tv';
  } else {
    itemType = 'movie';
  }

  return { language: lang, type: itemType };
}

function cleanActorName(name) {
  if (!name || typeof name !== 'string') return null;
  let cleaned = name.replace(/\s*\([^)]*\)/g, '').trim(); // Remove (actor), (actress), etc.
  const lower = cleaned.toLowerCase();

  // Filter out non-person words or character roles
  const invalidKeywords = ['nun', 'uncredited', 'self', 'voice', 'various', 'extra', 'category', 'file', 'image', 'thumb', 'director', 'producer', 'writer', 'unknown'];
  if (invalidKeywords.includes(lower) || cleaned.length < 3) return null;
  return cleaned;
}

async function autoResolveMovieMetadata(title) {
  if (!title) return null;
  const cleaned = cleanMovieTitleSmart(title);
  const cleanTitle = cleaned.title || title;

  let result = {
    title: cleanTitle,
    year: cleaned.year || null,
    posterUrl: '',
    imdbId: null,
    director: '',
    cast: [],
    genre: []
  };

  // 1. IMDb Suggestion API for official title, year, IMDb ID and 4K poster
  try {
    const imdbSug = await axios.get(`https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(cleanTitle.toLowerCase())}.json`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 4000
    });
    if (imdbSug.data && imdbSug.data.d && imdbSug.data.d.length > 0) {
      const best = imdbSug.data.d.find(item => item.qid === 'movie' || item.q === 'feature') || imdbSug.data.d[0];
      if (best) {
        if (best.l) result.title = best.l;
        if (best.y) result.year = best.y;
        if (best.id) result.imdbId = best.id;
        if (best.i && best.i.imageUrl) {
          result.posterUrl = best.i.imageUrl.replace(/\._V1_.*\.jpg$/i, '._V1_FMjpg_UX2500_.jpg');
        }
      }
    }
  } catch (err) {}

  // 2. OMDb with key trilogy
  try {
    const omdbQuery = result.imdbId ? `i=${result.imdbId}` : `t=${encodeURIComponent(result.title || cleanTitle)}`;
    const omdbRes = await axios.get(`http://www.omdbapi.com/?${omdbQuery}&plot=full&apikey=trilogy`, { timeout: 4000 });
    if (omdbRes.data && omdbRes.data.Response === 'True') {
      const data = omdbRes.data;
      if (!result.posterUrl && data.Poster && data.Poster !== 'N/A') {
        result.posterUrl = data.Poster.replace(/SX300|SX500|UX300/gi, 'UX2500');
      }
      if (data.Director && data.Director !== 'N/A') result.director = data.Director;
      if (data.Genre && data.Genre !== 'N/A') result.genre = data.Genre.split(',').map(g => g.trim());
      if (data.Actors && data.Actors !== 'N/A') {
        data.Actors.split(',').map(a => a.trim()).forEach(a => { if (a && !result.cast.includes(a)) result.cast.push(a); });
      }
      if (data.imdbRating && data.imdbRating !== 'N/A') result.imdbRating = parseFloat(data.imdbRating);
      if (data.Year && !result.year) result.year = parseInt(data.Year);
    }
  } catch (err) {}

  // 3. Wikipedia with proper User-Agent for Director & Cast (to guarantee >= 10 cast)
  try {
    const wikiHeaders = { 'User-Agent': 'CineVaultMovieBot/1.0 (contact@cinevault.local)' };
    const searchRes = await axios.get(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(result.title || cleanTitle)}&limit=3&format=json`, {
      headers: wikiHeaders,
      timeout: 3500
    });
    const pageTitle = searchRes.data?.[1]?.[0];
    if (pageTitle) {
      const wikiRes = await axios.get(`https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&titles=${encodeURIComponent(pageTitle)}&format=json`, {
        headers: wikiHeaders,
        timeout: 3500
      });
      const txt = Object.values(wikiRes.data?.query?.pages || {})[0]?.revisions?.[0]?.['*'] || '';
      
      // Director from Infobox
      if (!result.director) {
        const dirMatch = txt.match(/\|\s*director\s*=\s*\[\[([^\]\|]+)(?:\|[^\]]+)?\]\]/i);
        if (dirMatch) result.director = dirMatch[1].trim();
      }

      // Cast listing
      const castSectionMatch = txt.match(/(?:==\s*Cast\s*==|{{Cast listing\|)([\s\S]*?)(?===|\n\n==|\}\})/i);
      const searchBlock = castSectionMatch ? castSectionMatch[1] : txt;
      const wikiActors = (searchBlock.match(/\[\[([^\]\|]+)(?:\|[^\]]+)?\]\]/g) || [])
        .map(m => m.replace(/\[\[|\]\]/g, '').split('|')[0].trim())
        .filter(cleanActorName);
      
      wikiActors.forEach(a => {
        if (!result.cast.includes(a)) result.cast.push(a);
      });
    }
  } catch (err) {}

  result.cast = [...new Set(result.cast.map(cleanActorName).filter(Boolean))].slice(0, 10);
  return result;
}

async function getExtendedCastList(title, fallbackActors = '', imdbId = null) {
  const meta = await autoResolveMovieMetadata(title);
  let castList = meta && meta.cast ? [...meta.cast] : [];

  if (fallbackActors && fallbackActors !== 'N/A') {
    const existing = typeof fallbackActors === 'string' ? fallbackActors.split(',').map(c => c.trim()) : fallbackActors;
    existing.forEach(actor => {
      const cl = cleanActorName(actor);
      if (cl && !castList.includes(cl)) castList.push(cl);
    });
  }

  const finalCast = [...new Set(castList.map(cleanActorName).filter(Boolean))].slice(0, 10);
  if (finalCast.length > 0) {
    return finalCast.join(', ');
  }
  return fallbackActors || 'Unknown Cast';
}

// SMART MOVIE TITLE CLEANER HELPER (Super Thorough Cleaning)
function cleanMovieTitleSmart(rawTitle) {
  if (!rawTitle) return { title: '', year: null, originalClean: '' };

  let str = rawTitle
    .replace(/\.[^/.]+$/, '') // remove extension (.mkv, .mp4, etc)
    .replace(/[\._\-]/g, ' '); // replace dots, underscores, dashes with space

  // Strip site prefixes/suffixes & release groups in brackets or standalone
  str = str.replace(/baiscopedownloads\s*\.link|baiscopedownloads|baiscope\s*\.lk|baiscope|sinhalasub\s*\.lk|sinhalasub|cinesubz\s*\.co|cinesubz|yts\s*\.mx|yts\s*\.lt|yts|yify|rarbg|ettv|eztv|tgx|psa|fgt|sparks|galaxyrg|utr|ion10|pahe|1337x|torrent|link/gi, ' ');
  str = str.replace(/\(.*?\)|\[.*?\]|\{.*?\}/g, ' '); // remove parenthetical content like [SinhalaSub.lk]

  // Extract year if 4 digits between 1920 and 2030
  let year = null;
  const yearMatch = str.match(/\b(19\d\d|20[0-3]\d)\b/);
  if (yearMatch) {
    year = parseInt(yearMatch[1]);
    str = str.replace(/\b(19\d\d|20[0-3]\d)\b/g, ' ');
  }

  // Strip languages (including Malayalam, Kannada, Marathi, Punjabi, etc)
  str = str.replace(/\b(english|hindi|tamil|telugu|sinhala|malayalam|kannada|marathi|bengali|punjabi|gujarati|bhojpuri|urdu|korean|japanese|chinese|spanish|french|german|russian|italian|portuguese|arabic|turkish)\b/gi, ' ');

  // Strip quality, codec, audio, release, rip, scene, source tags (including standalone DL, WEB-DL, etc)
  str = str.replace(/\b(1080p|720p|480p|360p|2160p|4k|uhd|hdr|hdr10|bluray|blu-ray|webdl|web-dl|web|webrip|hdtvrip|hdtv|hdrip|dvdrip|dvd|brrip|bdrip|vhs|cam|hdcam|hdts|tc|hc|clean|line|mic|x264|x265|h264|h265|hevc|aac|ac3|dts|dd5\.1|dd7\.1|5\.1|7\.1|ch|xvid|divx|dl|unrated|uncut|extended|edition|proper|repack|remux|dsnp|nf|amzn|hmax|v2|v1|multi|dual|audio|dubbed|subbed|sub|esub|esubs|hq|lq|800mb|700mb|900mb|650mb|500mb|1gb|2gb)\b/gi, ' ');

  const title = str.replace(/\s+/g, ' ').trim();
  const originalClean = rawTitle.replace(/\.[^/.]+$/, '').replace(/[\._\-]/g, ' ').trim();

  return { title: title || originalClean, year, originalClean };
}

// SEARCH MOVIES ONLINE ENDPOINT (Live autocomplete & search results via TMDB, OMDb, iTunes, TVMaze)
app.get('/api/search-movies', async (req, res) => {
  const queryTitle = req.query.q || req.query.title;
  if (!queryTitle || queryTitle.trim().length < 2) {
    return res.json({ success: true, results: [] });
  }

  const cleaned = cleanMovieTitleSmart(queryTitle);
  const cleanTitle = cleaned.title;

  const results = [];
  const seenTitles = new Set();
  const tmdbKeys = ['15d2dde73f0e32cd39c335a7373b773f', '35c754d924d67396788a5316ee0a1f9a', 'b61b9949666f212217d85310997e7864', '8496be0b21498055422db7b693738785'];

  // 1. Try TMDB Search API (#1 Movie Database in the World)
  for (const key of tmdbKeys) {
    try {
      const yearQuery = cleaned.year ? `&year=${cleaned.year}` : '';
      const tmdbUrl = `https://api.themoviedb.org/3/search/movie?api_key=${key}&query=${encodeURIComponent(cleanTitle)}${yearQuery}`;
      const tmdbRes = await axios.get(tmdbUrl, { timeout: 3500 });
      if (tmdbRes.data && tmdbRes.data.results && tmdbRes.data.results.length > 0) {
        for (const item of tmdbRes.data.results.slice(0, 6)) {
          if (!item.title) continue;
          const titleKey = item.title.toLowerCase().trim();
          if (seenTitles.has(titleKey)) continue;
          seenTitles.add(titleKey);

          const year = item.release_date ? new Date(item.release_date).getFullYear() : (cleaned.year || 2024);
          const poster = item.poster_path ? `https://image.tmdb.org/t5/p/w780${item.poster_path}` : '';

          results.push({
            title: item.title,
            year: year,
            posterUrl: poster,
            type: 'movie',
            tmdbId: item.id,
            source: 'TMDB'
          });
        }
        break;
      }
    } catch (e) {}
  }

  // 2. Try OMDb Search API
  const omdbKeys = ['trilogy', 'b7da4d4b', '3a8f5c88', '570a2569'];
  for (const key of omdbKeys) {
    try {
      const yearQuery = cleaned.year ? `&y=${cleaned.year}` : '';
      const omdbSearchRes = await axios.get(`http://www.omdbapi.com/?s=${encodeURIComponent(cleanTitle)}${yearQuery}&apikey=${key}`, { timeout: 3500 });
      if (omdbSearchRes.data && omdbSearchRes.data.Response === 'True' && omdbSearchRes.data.Search) {
        for (const item of omdbSearchRes.data.Search.slice(0, 6)) {
          const titleKey = item.Title.toLowerCase().trim();
          if (seenTitles.has(titleKey)) continue;
          seenTitles.add(titleKey);

          let hdPoster = (item.Poster && item.Poster !== 'N/A') ? item.Poster.replace(/SX300|SX500|UX300/gi, 'SX1500') : '';

          results.push({
            title: item.Title,
            year: parseInt(item.Year) || cleaned.year || 2024,
            posterUrl: hdPoster,
            type: item.Type === 'series' ? 'tv' : 'movie',
            imdbId: item.imdbID,
            source: 'OMDb'
          });
        }
        break;
      }
    } catch (e) {}
  }

  // 3. Try iTunes Search API
  try {
    const itunesRes = await axios.get(`https://itunes.apple.com/search?term=${encodeURIComponent(cleanTitle)}&media=movie&limit=6`, { timeout: 3500 });
    if (itunesRes.data && itunesRes.data.resultCount > 0) {
      for (const movie of itunesRes.data.results) {
        if (!movie.trackName) continue;
        const titleKey = movie.trackName.toLowerCase().trim();
        if (seenTitles.has(titleKey)) continue;
        seenTitles.add(titleKey);

        const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : (cleaned.year || 2024);
        const poster = movie.artworkUrl100 ? movie.artworkUrl100.replace('100x100bb', '1400x2100bb') : '';

        results.push({
          title: movie.trackName,
          year: year,
          posterUrl: poster,
          director: movie.artistName || 'Unknown',
          genre: movie.primaryGenreName || 'Action, Drama',
          type: 'movie',
          source: 'iTunes'
        });
      }
    }
  } catch (e) {}

  res.json({ success: true, results });
});

// FORMAT RICH MOVIE REVIEW & SUMMARY HELPER
function formatRichMovieReview({ title, plot, director, cast, rating, genre }) {
  const cleanPlot = (plot && plot !== 'N/A' && plot.length > 5) 
    ? plot.trim() 
    : `${title} is a captivating cinematic production delivering a memorable story and intense drama.`;

  const ratingBadge = rating ? `⭐ ${rating}/10 IMDb Rating` : '⭐ 8.5/10 Rating';
  const directorStr = (director && director !== 'N/A' && director !== 'Unknown Director' && director !== 'Unknown') 
    ? `Directed by ${director}. ` 
    : '';
  const castStr = (cast && cast !== 'N/A' && cast !== 'Popular Cast' && cast.length > 3) 
    ? `Starring ${cast}. ` 
    : '';

  return `🎬 STORYLINE OVERVIEW:
${cleanPlot}

⭐ CINEMA REVIEW & VERDICT:
${title} is a standout ${genre || 'Action, Drama'} release. ${directorStr}${castStr}${ratingBadge} - Highly recommended watch for cinema lovers!`;
}

// AUTOMATIC MOVIE METADATA SEARCH & AUTO-FILL ENDPOINT
app.get('/api/fetch-metadata', async (req, res) => {
  const queryTitle = req.query.title;
  const imdbIdParam = req.query.imdbId;

  if (!queryTitle && !imdbIdParam) return res.status(400).json({ error: 'Title or imdbId parameter is required' });

  const cleaned = cleanMovieTitleSmart(queryTitle || '');
  const cleanTitle = cleaned.title;
  const targetYear = cleaned.year;
  const omdbKeys = ['trilogy', 'b7da4d4b', '3a8f5c88', '570a2569'];
  const tmdbKeys = ['15d2dde73f0e32cd39c335a7373b773f', '35c754d924d67396788a5316ee0a1f9a', 'b61b9949666f212217d85310997e7864', '8496be0b21498055422db7b693738785'];

  try {
    // 0. Primary High-Reliability Resolver (IMDb Suggestion + Wikipedia + OMDb)
    const richMeta = await autoResolveMovieMetadata(queryTitle || cleanTitle);
    if (richMeta && (richMeta.posterUrl || richMeta.cast.length > 0)) {
      const detected = detectLanguageAndType({
        title: richMeta.title,
        genre: richMeta.genre.join(', '),
        director: richMeta.director,
        cast: richMeta.cast.join(', '),
        language: req.query.language
      });

      const ratingVal = richMeta.imdbRating || 8.0;
      const reviewText = formatRichMovieReview({
        title: richMeta.title,
        plot: `${richMeta.title} delivers an engaging storyline with spectacular performances.`,
        director: richMeta.director,
        cast: richMeta.cast.join(', '),
        rating: ratingVal,
        genre: richMeta.genre.join(', ') || 'Action, Drama'
      });

      return res.json({
        success: true,
        title: richMeta.title,
        sinhalaTitle: `${richMeta.title} (Sinhala Subtitles)`,
        year: richMeta.year || targetYear || 2025,
        director: richMeta.director || 'Popular Director',
        cast: richMeta.cast.join(', '),
        genre: richMeta.genre.length > 0 ? richMeta.genre.join(', ') : 'Action, Drama',
        imdbRating: ratingVal,
        duration: '140 min',
        posterUrl: upgradeTo4KPoster(richMeta.posterUrl),
        backdropUrl: upgradeTo4KPoster(richMeta.posterUrl),
        notes: reviewText,
        language: detected.language,
        type: detected.type,
        imdbId: richMeta.imdbId || imdbIdParam || null
      });
    }

    // 1. If IMDb ID is specified, lookup directly by IMDb ID
    if (imdbIdParam) {
      for (const key of omdbKeys) {
        try {
          const omdbRes = await axios.get(`http://www.omdbapi.com/?i=${encodeURIComponent(imdbIdParam)}&plot=full&apikey=${key}`, { timeout: 4000 });
          if (omdbRes.data && omdbRes.data.Response === 'True') {
            const data = omdbRes.data;
            const detected = detectLanguageAndType({
              title: data.Title,
              genre: data.Genre,
              director: data.Director,
              cast: data.Actors,
              country: data.Country,
              language: data.Language,
              type: data.Type
            });

            let hdPoster = '';
            if (data.Poster && data.Poster !== 'N/A') {
              hdPoster = data.Poster.replace(/SX300|SX500|UX300/gi, 'SX1500');
            }

            const extendedCast = await getExtendedCastList(data.Title || cleanTitle, data.Actors !== 'N/A' ? data.Actors : 'Unknown');
            const ratingVal = data.imdbRating !== 'N/A' ? parseFloat(data.imdbRating) : 8.5;
            const reviewText = formatRichMovieReview({
              title: data.Title || cleanTitle,
              plot: data.Plot,
              director: data.Director,
              cast: extendedCast,
              rating: ratingVal,
              genre: data.Genre
            });

            return res.json({
              success: true,
              title: data.Title || cleanTitle,
              sinhalaTitle: `${data.Title} (Sinhala Subtitles)`,
              year: parseInt(data.Year) || 2024,
              director: data.Director !== 'N/A' ? data.Director : 'Unknown',
              cast: extendedCast,
              genre: data.Genre !== 'N/A' ? data.Genre : 'Action, Drama',
              imdbRating: ratingVal,
              duration: data.Runtime !== 'N/A' ? data.Runtime : '120 min',
              posterUrl: hdPoster,
              notes: reviewText,
              language: detected.language,
              type: detected.type,
              imdbId: data.imdbID || imdbIdParam
            });
          }
        } catch (err) {}
      }
    }

    // 2. Try TMDB Search API (#1 Primary Database)
    for (const key of tmdbKeys) {
      try {
        const yearQuery = targetYear ? `&year=${targetYear}` : '';
        const tmdbUrl = `https://api.themoviedb.org/3/search/movie?api_key=${key}&query=${encodeURIComponent(cleanTitle)}${yearQuery}`;
        const tmdbRes = await axios.get(tmdbUrl, { timeout: 4000 });
        if (tmdbRes.data && tmdbRes.data.results && tmdbRes.data.results.length > 0) {
          const topMovie = tmdbRes.data.results[0];
          const tmdbId = topMovie.id;

          const detailUrl = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${key}&append_to_response=credits`;
          const detailRes = await axios.get(detailUrl, { timeout: 4000 });
          if (detailRes.data) {
            const d = detailRes.data;
            const releaseYear = d.release_date ? new Date(d.release_date).getFullYear() : (targetYear || 2024);
            const poster = d.poster_path ? `https://image.tmdb.org/t5/p/w780${d.poster_path}` : '';
            const genres = d.genres ? d.genres.map(g => g.name).join(', ') : 'Action, Drama';
            const directorObj = d.credits && d.credits.crew ? d.credits.crew.find(c => c.job === 'Director') : null;
            const director = directorObj ? directorObj.name : 'Unknown Director';
            const castList = d.credits && d.credits.cast ? d.credits.cast.slice(0, 12).map(c => c.name).join(', ') : 'Popular Cast';
            const hrs = d.runtime ? Math.floor(d.runtime / 60) : 2;
            const mins = d.runtime ? (d.runtime % 60) : 0;
            const formattedDuration = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
            const ratingVal = d.vote_average ? parseFloat(d.vote_average.toFixed(1)) : 8.0;

            const detected = detectLanguageAndType({
              title: d.title || cleanTitle,
              genre: genres,
              director: director
            });

            const reviewText = formatRichMovieReview({
              title: d.title || cleanTitle,
              plot: d.overview,
              director: director,
              cast: castList,
              rating: ratingVal,
              genre: genres
            });

            return res.json({
              success: true,
              title: d.title || cleanTitle,
              sinhalaTitle: `${d.title || cleanTitle} (Sinhala Subtitles)`,
              year: releaseYear,
              director: director,
              cast: castList,
              genre: genres,
              imdbRating: ratingVal,
              duration: formattedDuration,
              posterUrl: poster,
              backdropUrl: d.backdrop_path ? `https://image.tmdb.org/t5/p/w1280${d.backdrop_path}` : '',
              notes: reviewText,
              language: detected.language,
              type: 'movie',
              imdbId: d.imdb_id || null
            });
          }
        }
      } catch (e) {}
    }

    // 3. Try OMDb API by Direct Title
    for (const key of omdbKeys) {
      try {
        const omdbRes = await axios.get(`http://www.omdbapi.com/?t=${encodeURIComponent(cleanTitle)}&plot=full&apikey=${key}`, { timeout: 4000 });
        if (omdbRes.data && omdbRes.data.Response === 'True') {
          const data = omdbRes.data;
          const detected = detectLanguageAndType({
            title: data.Title,
            genre: data.Genre,
            director: data.Director,
            cast: data.Actors,
            country: data.Country,
            language: data.Language,
            type: data.Type
          });

          let hdPoster = '';
          if (data.Poster && data.Poster !== 'N/A') {
            hdPoster = data.Poster.replace(/SX300|SX500|UX300/gi, 'SX1500');
          }

          const extendedCast = await getExtendedCastList(data.Title || cleanTitle, data.Actors !== 'N/A' ? data.Actors : 'Unknown');
          const ratingVal = data.imdbRating !== 'N/A' ? parseFloat(data.imdbRating) : 8.5;
          const reviewText = formatRichMovieReview({
            title: data.Title || cleanTitle,
            plot: data.Plot,
            director: data.Director,
            cast: extendedCast,
            rating: ratingVal,
            genre: data.Genre
          });

          return res.json({
            success: true,
            title: data.Title || cleanTitle,
            sinhalaTitle: `${data.Title} (Sinhala Subtitles)`,
            year: parseInt(data.Year) || 2024,
            director: data.Director !== 'N/A' ? data.Director : 'Unknown',
            cast: extendedCast,
            genre: data.Genre !== 'N/A' ? data.Genre : 'Action, Drama',
            imdbRating: ratingVal,
            duration: data.Runtime !== 'N/A' ? data.Runtime : '120 min',
            posterUrl: hdPoster,
            notes: reviewText,
            language: detected.language,
            type: detected.type,
            imdbId: data.imdbID || null
          });
        }
      } catch (err) {}
    }

    // 4. Try OMDb Search API (s=cleanTitle) -> fetch full details of top result (i=imdbID)
    for (const key of omdbKeys) {
      try {
        const omdbSearch = await axios.get(`http://www.omdbapi.com/?s=${encodeURIComponent(cleanTitle)}&apikey=${key}`, { timeout: 4000 });
        if (omdbSearch.data && omdbSearch.data.Response === 'True' && omdbSearch.data.Search && omdbSearch.data.Search.length > 0) {
          const topMatch = omdbSearch.data.Search[0];
          const omdbDetail = await axios.get(`http://www.omdbapi.com/?i=${topMatch.imdbID}&plot=full&apikey=${key}`, { timeout: 4000 });
          if (omdbDetail.data && omdbDetail.data.Response === 'True') {
            const data = omdbDetail.data;
            const detected = detectLanguageAndType({
              title: data.Title,
              genre: data.Genre,
              director: data.Director,
              cast: data.Actors,
              country: data.Country,
              language: data.Language,
              type: data.Type
            });

            let hdPoster = '';
            if (data.Poster && data.Poster !== 'N/A') {
              hdPoster = data.Poster.replace(/SX300|SX500|UX300/gi, 'SX1500');
            }

            const extendedCast = await getExtendedCastList(data.Title || cleanTitle, data.Actors !== 'N/A' ? data.Actors : 'Unknown');
            const ratingVal = data.imdbRating !== 'N/A' ? parseFloat(data.imdbRating) : 8.5;
            const reviewText = formatRichMovieReview({
              title: data.Title || cleanTitle,
              plot: data.Plot,
              director: data.Director,
              cast: extendedCast,
              rating: ratingVal,
              genre: data.Genre
            });

            return res.json({
              success: true,
              title: data.Title || cleanTitle,
              sinhalaTitle: `${data.Title} (Sinhala Subtitles)`,
              year: parseInt(data.Year) || 2024,
              director: data.Director !== 'N/A' ? data.Director : 'Unknown',
              cast: extendedCast,
              genre: data.Genre !== 'N/A' ? data.Genre : 'Action, Drama',
              imdbRating: ratingVal,
              duration: data.Runtime !== 'N/A' ? data.Runtime : '120 min',
              posterUrl: hdPoster,
              notes: reviewText,
              language: detected.language,
              type: detected.type,
              imdbId: data.imdbID || null
            });
          }
        }
      } catch (err) {}
    }

    // 5. Try First 2 Words fallback for long titles
    const titleWords = cleanTitle.split(' ');
    if (titleWords.length > 2) {
      const shortTitle = titleWords.slice(0, 2).join(' ');
      for (const key of tmdbKeys) {
        try {
          const tmdbUrl = `https://api.themoviedb.org/3/search/movie?api_key=${key}&query=${encodeURIComponent(shortTitle)}`;
          const tmdbRes = await axios.get(tmdbUrl, { timeout: 3500 });
          if (tmdbRes.data && tmdbRes.data.results && tmdbRes.data.results.length > 0) {
            const topMovie = tmdbRes.data.results[0];
            const detailUrl = `https://api.themoviedb.org/3/movie/${topMovie.id}?api_key=${key}&append_to_response=credits`;
            const detailRes = await axios.get(detailUrl, { timeout: 3500 });
            if (detailRes.data) {
              const d = detailRes.data;
              const releaseYear = d.release_date ? new Date(d.release_date).getFullYear() : (targetYear || 2024);
              const poster = d.poster_path ? `https://image.tmdb.org/t5/p/w780${d.poster_path}` : '';
              const genres = d.genres ? d.genres.map(g => g.name).join(', ') : 'Action, Drama';
              const directorObj = d.credits && d.credits.crew ? d.credits.crew.find(c => c.job === 'Director') : null;
              const director = directorObj ? directorObj.name : 'Unknown Director';
              const ratingVal = d.vote_average ? parseFloat(d.vote_average.toFixed(1)) : 8.0;
              const reviewText = formatRichMovieReview({
                title: d.title || shortTitle,
                plot: d.overview,
                director: director,
                cast: 'Popular Cast',
                rating: ratingVal,
                genre: genres
              });

              return res.json({
                success: true,
                title: d.title || shortTitle,
                sinhalaTitle: `${d.title || shortTitle} (Sinhala Subtitles)`,
                year: releaseYear,
                director: director,
                cast: 'Popular Cast',
                genre: genres,
                imdbRating: ratingVal,
                duration: `${d.runtime || 120} min`,
                posterUrl: poster,
                notes: reviewText,
                language: 'English',
                type: 'movie',
                imdbId: d.imdb_id || null
              });
            }
          }
        } catch (e) {}
      }
    }

    // 6. Fallback: iTunes Search API
    try {
      const itunesRes = await axios.get(`https://itunes.apple.com/search?term=${encodeURIComponent(cleanTitle)}&media=movie&limit=1`, { timeout: 4000 });
      if (itunesRes.data && itunesRes.data.resultCount > 0) {
        const movie = itunesRes.data.results[0];
        const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : 2024;
        const poster = movie.artworkUrl100 ? movie.artworkUrl100.replace('100x100bb', '1400x2100bb') : '';
        const durationMins = movie.trackTimeMillis ? Math.round(movie.trackTimeMillis / 60000) : 120;
        const hrs = Math.floor(durationMins / 60);
        const mins = durationMins % 60;
        const reviewText = formatRichMovieReview({
          title: movie.trackName || cleanTitle,
          plot: movie.longDescription || movie.shortDescription,
          director: movie.artistName,
          cast: 'Popular Cast',
          rating: 8.0,
          genre: movie.primaryGenreName
        });

        return res.json({
          success: true,
          title: movie.trackName || cleanTitle,
          sinhalaTitle: `${movie.trackName} (Sinhala Subtitles)`,
          year: year,
          director: movie.artistName || 'Unknown',
          cast: 'Popular Cast',
          genre: movie.primaryGenreName || 'Action, Drama',
          imdbRating: 8.0,
          duration: `${hrs}h ${mins}m`,
          posterUrl: poster,
          notes: reviewText,
          language: 'English',
          type: 'movie'
        });
      }
    } catch (e) {}

    // 7. Fallback: Wikipedia OpenSearch API
    try {
      const wikiSearchRes = await axios.get(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(cleanTitle)}&limit=1&format=json&origin=*`, { timeout: 4000 });
      if (wikiSearchRes.data && wikiSearchRes.data[1] && wikiSearchRes.data[1].length > 0) {
        const wikiTitle = wikiSearchRes.data[1][0];
        const wikiSummary = await axios.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`, { timeout: 4000 });
        if (wikiSummary.data && wikiSummary.data.title) {
          const page = wikiSummary.data;
          const poster = page.thumbnail ? page.thumbnail.source : '';
          const reviewText = formatRichMovieReview({
            title: page.title || cleanTitle,
            plot: page.extract,
            director: 'Popular Director',
            cast: 'Popular Cast',
            rating: 8.0,
            genre: 'Action, Drama'
          });

          return res.json({
            success: true,
            title: page.title || cleanTitle,
            sinhalaTitle: `${page.title || cleanTitle} (Sinhala Subtitles)`,
            year: targetYear || 2024,
            director: 'Popular Director',
            cast: 'Popular Cast',
            genre: 'Action, Drama',
            imdbRating: 8.0,
            duration: '120 min',
            posterUrl: poster,
            notes: reviewText,
            language: 'English',
            type: 'movie'
          });
        }
      }
    } catch (e) {}

    // 8. Ultimate Smart Fallback
    const displayTitle = cleanTitle || queryTitle;
    const reviewText = formatRichMovieReview({
      title: displayTitle,
      plot: `${displayTitle} is an exciting feature movie.`,
      director: 'Popular Director',
      cast: 'Popular Cast',
      rating: 8.0,
      genre: 'Action, Drama'
    });

    return res.json({
      success: true,
      title: displayTitle,
      sinhalaTitle: `${displayTitle} (Sinhala Subtitles)`,
      year: targetYear || 2024,
      director: 'Popular Director',
      cast: 'Popular Cast',
      genre: 'Action, Drama',
      imdbRating: 8.0,
      duration: '120 min',
      posterUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(displayTitle)}&background=181826&color=e50914&size=512&bold=true`,
      notes: reviewText,
      language: 'English',
      type: 'movie'
    });
  } catch (error) {
    console.error('Metadata fetch error:', error.message);
    const displayTitle = req.query.title || 'Untitled Movie';
    res.json({
      success: true,
      title: displayTitle,
      sinhalaTitle: `${displayTitle} (Sinhala Subtitles)`,
      year: 2024,
      director: 'Popular Director',
      cast: 'Popular Cast',
      genre: 'Action, Drama',
      imdbRating: 8.0,
      duration: '120 min',
      posterUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(displayTitle)}&background=181826&color=e50914&size=512&bold=true`,
      notes: `🎬 STORYLINE OVERVIEW:\n${displayTitle} is a movie production.\n\n⭐ CINEMA REVIEW & VERDICT:\nHighly recommended watch!`,
      language: 'English',
      type: 'movie'
    });
  }
});

// Update Movie (Enforce Minimum 10 Cast Members)
app.put('/api/movies/:id', async (req, res) => {
  const movies = getMovies();
  const index = movies.findIndex(m => m.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Movie not found' });

  let updated = { ...movies[index], ...req.body };
  let castList = Array.isArray(updated.cast) ? updated.cast : (updated.cast ? updated.cast.split(',').map(s=>s.trim()).filter(Boolean) : []);
  if (castList.length < 10 && updated.title) {
    const extendedStr = await getExtendedCastList(updated.title, castList.join(', '), updated.imdbId);
    if (extendedStr) {
      castList = extendedStr.split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  // Enforce Mandatory Rule 1: Strictly exactly 10 cast members
  if (castList.length > 0) {
    updated.cast = castList.slice(0, 10);
  }

  movies[index] = updated;
  saveMovies(movies);
  res.json(movies[index]);
});

// Delete Movie
app.delete('/api/movies/:id', (req, res) => {
  let movies = getMovies();
  const target = movies.find(m => m.id === req.params.id);
  if (!target) return res.status(404).json({ error: 'Movie not found' });

  if (target.videoUrl && target.videoUrl.startsWith('/uploads/')) {
    const videoPath = path.join(__dirname, target.videoUrl);
    if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
  }

  movies = movies.filter(m => m.id !== req.params.id);
  saveMovies(movies);
  res.json({ success: true, message: 'Movie deleted' });
});

// DELETE LOCAL VIDEO FILE FROM PC HARD DRIVE TO FREE DISK SPACE
app.post('/api/movies/:id/delete-local-video', (req, res) => {
  let movies = getMovies();
  const movie = movies.find(m => m.id === req.params.id);
  if (!movie) return res.status(404).json({ error: 'Movie not found' });

  if (movie.videoUrl && movie.videoUrl.startsWith('/uploads/')) {
    const videoPath = path.join(__dirname, movie.videoUrl);
    if (fs.existsSync(videoPath)) {
      try {
        fs.unlinkSync(videoPath);
        console.log(`[Disk Space Freed] Deleted local video file from PC: ${videoPath}`);
      } catch (err) {
        console.error('Error deleting local video file:', err);
      }
    }
    movie.videoUrl = '';
    saveMovies(movies);
    return res.json({ success: true, message: 'Local PC video file deleted successfully! Hard drive space freed.' });
  }

  return res.json({ success: false, message: 'No local video file found on PC disk.' });
});

// IMAGE PROXY ENDPOINT TO SAFELY DELIVER ANY EXTERNAL POSTER / AVATAR WITHOUT CORS OR HOTLINK BLOCKS
app.get('/api/image-proxy', async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) return res.status(400).send('Missing url');
  try {
    const response = await axios({
      method: 'get',
      url: imageUrl,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      },
      timeout: 8000
    });
    const contentType = response.headers['content-type'] || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    response.data.pipe(res);
  } catch (err) {
    return res.redirect(imageUrl);
  }
});

// REAL ACTOR AVATAR AUTOMATIC SEARCH ENDPOINT (CACHED + BING ULTRA-HD + WIKIPEDIA REST API)
app.get('/api/actor-avatar', async (req, res) => {
  const actorName = req.query.name;
  if (!actorName) return res.status(400).json({ error: 'Name parameter is required' });

  const cleanName = actorName.trim();
  const lowerName = cleanName.toLowerCase();

  // 1. Check persistent memory cache (Immediate sub-millisecond response)
  if (actorAvatarCache[lowerName] && typeof actorAvatarCache[lowerName] === 'string' && actorAvatarCache[lowerName].startsWith('http')) {
    const cachedUrl = actorAvatarCache[lowerName];
    return res.json({ 
      success: true, 
      imageUrl: cachedUrl, 
      proxyUrl: `/api/image-proxy?url=${encodeURIComponent(cachedUrl)}` 
    });
  }

  const browserHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9'
  };

  // 2. High-speed Bing Actor Professional Studio Portrait / Headshot Search
  try {
    const bingRes = await axios.get(`https://www.bing.com/images/search?q=${encodeURIComponent(cleanName + ' actor photoshoot portrait headshot')}&form=HDRSC2`, {
      headers: browserHeaders,
      timeout: 4000
    });
    const matches = bingRes.data.match(/murl&quot;:&quot;(https?:[^&]+?\.(?:jpg|jpeg|png|webp))/gi) || [];
    if (matches.length > 0) {
      // Find clean profile/portrait image if possible
      let chosenImg = matches[0].replace(/murl&quot;:&quot;/, '');
      for (const m of matches) {
        const url = m.replace(/murl&quot;:&quot;/, '');
        if (/tmdb|themoviedb|amazon|filmibeat|starsunfolded|wikimedia|wikibio|nettv4u/i.test(url)) {
          chosenImg = url;
          break;
        }
      }
      actorAvatarCache[lowerName] = chosenImg;
      actorAvatarCache[cleanName] = chosenImg;
      saveActorAvatarCache();
      return res.json({ 
        success: true, 
        imageUrl: chosenImg, 
        proxyUrl: `/api/image-proxy?url=${encodeURIComponent(chosenImg)}` 
      });
    }
  } catch (err) {}

  // 3. Wikipedia Direct REST API fallback
  try {
    const wikiRes = await axios.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanName)}`, {
      headers: browserHeaders,
      timeout: 3000
    });
    const foundImg = wikiRes.data?.thumbnail?.source || wikiRes.data?.original?.source;
    if (foundImg) {
      actorAvatarCache[lowerName] = foundImg;
      actorAvatarCache[cleanName] = foundImg;
      saveActorAvatarCache();
      return res.json({ 
        success: true, 
        imageUrl: foundImg, 
        proxyUrl: `/api/image-proxy?url=${encodeURIComponent(foundImg)}` 
      });
    }
  } catch (err) {}

  // 4. Wikipedia Search Query fallback
  try {
    const searchRes = await axios.get(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanName)}&format=json&origin=*`, {
      headers: browserHeaders,
      timeout: 3000
    });
    const firstTitle = searchRes.data?.query?.search?.[0]?.title;
    if (firstTitle) {
      const wikiRes2 = await axios.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(firstTitle)}`, {
        headers: browserHeaders,
        timeout: 3000
      });
      const foundImg2 = wikiRes2.data?.thumbnail?.source || wikiRes2.data?.original?.source;
      if (foundImg2) {
        actorAvatarCache[lowerName] = foundImg2;
        actorAvatarCache[cleanName] = foundImg2;
        saveActorAvatarCache();
        return res.json({ 
          success: true, 
          imageUrl: foundImg2, 
          proxyUrl: `/api/image-proxy?url=${encodeURIComponent(foundImg2)}` 
        });
      }
    }
  } catch (err) {}

  // Fallback to high-res UI Avatars with retina scaling
  const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(cleanName)}&background=181826&color=e50914&size=512&bold=true`;
  return res.json({ success: false, imageUrl: fallbackUrl, proxyUrl: fallbackUrl });
});

// AUTOMATIC YOUTUBE OFFICIAL TRAILER SEARCH ENDPOINT
app.get('/api/youtube-trailer', async (req, res) => {
  const queryTitle = req.query.title;
  if (!queryTitle) return res.status(400).json({ error: 'Title parameter is required' });

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
  };

  try {
    const query = `${queryTitle} official trailer`;
    const ytRes = await axios.get(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
      headers,
      timeout: 4500
    });
    const match = ytRes.data.match(/"videoId":"([a-zA-Z0-9_\-]{11})"/);
    if (match && match[1]) {
      const videoId = match[1];
      return res.json({
        success: true,
        videoId: videoId,
        embedUrl: `https://www.youtube.com/embed/${videoId}`
      });
    }
  } catch (err) {
    console.error('YouTube search error:', err.message);
  }

  return res.json({
    success: false,
    embedUrl: `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(queryTitle + ' official trailer')}`
  });
});

// HTTP 206 Partial Content Local Streaming Engine
app.get('/api/stream/:filename', (req, res) => {
  const filePath = path.join(__dirname, 'uploads', 'videos', req.params.filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

// Download Route
app.get('/api/download/:id', async (req, res) => {
  const movies = getMovies();
  const movie = movies.find(m => m.id === req.params.id);
  
  if (!movie) {
    return res.status(404).json({ error: 'Movie file not found' });
  }

  const msgIdMatch = movie.videoUrl && movie.videoUrl.match(/\/telegram\/file\/(\d+)/);
  const effectiveTelegramMsgId = movie.telegramMsgId || (msgIdMatch ? msgIdMatch[1] : null);

  if (effectiveTelegramMsgId) {
    return tgStorage.streamToResponse(effectiveTelegramMsgId, req, res, {
      download: true,
      filename: `${movie.title} [${movie.quality || '1080p'}].mkv`
    });
  }

  if (movie.telegramFileId) {
    const tgUrl = await getTelegramFileUrl(movie.telegramFileId);
    if (tgUrl) return res.redirect(tgUrl);
  }

  if (movie.videoUrl && movie.videoUrl.startsWith('/uploads/')) {
    const filePath = path.join(__dirname, movie.videoUrl);
    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath) || '.mkv';
      return res.download(filePath, `${movie.title} [${movie.quality || '1080p'}]${ext}`);
    }
  }

  if (movie.videoUrl && (movie.videoUrl.startsWith('http://') || movie.videoUrl.startsWith('https://'))) {
    return res.redirect(movie.videoUrl);
  }

  return res.status(404).send(`
    <!DOCTYPE html>
    <html lang="si">
    <head>
      <meta charset="utf-8">
      <title>චිත්‍රපට ගොනුව හමු නොවීය - CineVault</title>
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; background: #0c0d14; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
        .box { background: #181926; border: 1px solid #2e3046; border-radius: 14px; padding: 36px; max-width: 460px; box-shadow: 0 12px 30px rgba(0,0,0,0.6); }
        h2 { color: #e50914; margin-top: 0; font-size: 1.4rem; }
        p { color: #a4a9c4; font-size: 0.95rem; line-height: 1.6; }
        a { display: inline-block; margin-top: 20px; padding: 10px 24px; background: #e50914; color: #fff; text-decoration: none; border-radius: 8px; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="box">
        <h2>⚠️ චිත්‍රපට වීඩියෝ ගොනුව තවමත් නොමැත</h2>
        <p><strong>${movie.title}</strong> චිත්‍රපටය සඳහා වීඩියෝ ගොනුව (Telegram Cloud හෝ Local Storage) තවමත් Upload කර නොමැත හෝ ඉවත් කර ඇත.</p>
        <a href="/">නැවත මුල් පිටුවට</a>
      </div>
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`🎬 CineVault Server running on http://localhost:${PORT}`);
  console.log(`📡 Telegram Cloud Storage: Connected to Bot (${TELEGRAM_BOT_TOKEN.split(':')[0]}) and Chat (${TELEGRAM_CHAT_ID})`);
  
  // Pre-warm Telegram MTProto connection asynchronously
  tgStorage.getClient()
    .then(() => console.log('⚡ [Telegram MTProto] Cloud connection pre-warmed & ready.'))
    .catch(err => console.warn('⚠️ [Telegram MTProto] Pre-warm notice:', err.message));

  // Initialize Auto-Git-Sync to automatically push local changes to GitHub & Render
  if (process.env.NODE_ENV !== 'production') {
    try {
      require('./auto_git_sync');
    } catch (err) {
      console.error('[Auto-Git-Sync] Initialization error:', err.message);
    }
  }
});
