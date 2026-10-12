# CineVault Permanent Project Rules & Memory

## 1. MANDATORY RULE: MINIMUM 10 CAST MEMBERS FOR EVERY MOVIE (ALWAYS)
- **EVERY movie** added, edited, or displayed in CineVault MUST ALWAYS have **at least 10 cast members** (`cast.length >= 10`).
- NEVER save, display, or return a movie with fewer than 10 actors.
- If TMDB, IMDb, or Wikipedia returns fewer than 10 actors initially, the backend must query additional sources (Wikipedia Cast section, TMDB credits, OMDb) to expand the list to at least 10 verified actors.

## 2. PROFESSIONAL STUDIO ACTOR PORTRAITS ONLY
- Cast avatars in `#modalCastAvatars` must display clean, high-resolution, solo studio portraits or official headshots.
- NEVER use scene screenshots, group photos, or low-res thumbnails.
- All actor portraits are cached in `data/actor_cache.json` and proxied through `/api/image-proxy` to eliminate CORS / hotlinking blocks.

## 3. ZERO LOCAL DISK SPACE (TELEGRAM CLOUD STORAGE)
- **CRITICAL:** Never fill the user's local PC hard drive with heavy movie files.
- As soon as a video is uploaded to Telegram Cloud Storage (`tgStorage.uploadFile`), the local video file in `uploads/videos/` MUST be deleted immediately using `fs.unlinkSync()`.
- Local PC disk space usage for movie videos must remain **0 MB**.
- Video streaming and downloads on the website MUST route directly from Telegram Cloud Storage (`/api/telegram/file/:id` -> `tgStorage.streamToResponse`).

## 4. IMMEDIATE MOVIE PERSISTENCE (ZERO DATA LOSS)
- Whenever a movie is uploaded via the web interface (`/api/movies`), the movie metadata MUST be saved into `data/movies.json` immediately (`movies.unshift(newMovie); saveMovies(movies);`) BEFORE running long Telegram cloud uploads.
- Never wait until after Telegram upload completes to save the movie to the database. This prevents any movie loss from connection drops, browser timeouts, or interruptions.

## 5. ORDERED TELEGRAM CHANNEL POSTING FORMAT
- For each movie posted or synced to the Telegram Channel (`MovieVault`), maintain this strict order:
  1. **Movie Poster (High-Res 4K Image):** Send photo first (`sendPhoto`).
  2. **Caption (Under the poster):**
     - 🎬 **Movie Name & Sinhala Title**
     - 🎭 **Genre, IMDb Rating, Duration, Language**
     - 💿 **Quality & File Size**
     - 👤 **Director & Top Starring Cast**
     - 📥 **Direct Download Link:** `https://t.me/c/<channel_id>/<file_message_id>`
     - 🔘 **Interactive Button:** `[ 📥 Download / Watch Video ]` linking directly to the file message.
  3. **Video File Message:** Directly following the poster, upload the full movie file (`tgStorage.uploadFile`) via MTProto with the poster thumbnail attached.
- Never separate the poster and the video file into disjoint batches. Each movie's poster and its video file/download link must always be grouped together.

## 6. PROJECT RUN CONFIGURATION
- Server entry point is `server.js`. Run with `node server.js` or `npm start`.
- Static files served from `public/`.
- Telegram Cloud MTProto client configured in `tgstorage.js`.
