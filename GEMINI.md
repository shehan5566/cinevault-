# CineVault Workspace Memory & Permanent Guidelines

## 1. MANDATORY: STRICTLY EXACTLY 10 CAST MEMBERS FOR EVERY MOVIE
- Every single movie in this repository MUST have **strictly exactly 10 cast members** (`cast.length === 10`).
- This applies to adding new movies, editing movies, saving movies in `data/movies.json`, and rendering movies in the UI.
- Never show, generate, or save fewer than 10 or more than 10 cast members. It must ALWAYS be exactly 10 members.

## 2. HIGH-DEFINITION STUDIO ACTOR PORTRAITS
- All cast members must have clean, official, solo studio photoshoot portraits or TMDB headshots.
- No scene screenshots, no group scenes.
- Cached in `data/actor_cache.json` and proxied via `/api/image-proxy`.

## 3. ZERO LOCAL DISK SPACE (TELEGRAM CLOUD STORAGE)
- **CRITICAL:** Never store movie videos permanently on the local PC hard drive.
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

## 7. AUTOMATIC GITHUB PUSH & RENDER LIVE DEPLOYMENT
- All code changes, UI updates, bugfixes, and movie additions in `data/movies.json` MUST be committed and pushed automatically to GitHub (`origin main`).
- `auto_git_sync.js` runs automatically with `server.js` locally to watch project changes and push them within seconds.
- Render automatically detects the GitHub push and deploys the live production site without manual intervention.

## 8. PERMANENT PRODUCTION LOCK & ANTI-REGRESSION RULES (IMMUTABLE BASELINE)
- **MTProto Independent Sessions:** Never re-introduce a hardcoded shared `StringSession` in `tgstorage.js`. Keep the independent bot session generation and auto-recovery logic (`AUTH_KEY_DUPLICATED`) intact so Render production and local development never collide.
- **Pre-Warmed Cloud Connection:** Keep the `tgStorage.getClient()` pre-warm call in `server.js` `app.listen()` so video playback is instantaneous.
- **Embedded Subtitles & Single-File MKV:** All 85 WebVTT subtitles in `uploads/subtitles/` must remain tracked in git. The single direct download route (`/api/movies/:id/download`) must always serve `.mkv` files directly.
- **Player & UI Design Integrity:** Preserve the Cinesubz dark theme, Plymouth/Plyr player configurations, custom video controls, and the exact 10-cast members per movie rule.
- **Zero Local Disk Space:** Never store video files permanently on local PC or Render ephemeral disk. Always delete temporary upload videos immediately after Telegram MTProto upload completes.
- **Immutable State Protection:** No agent or automated process may rewrite, delete, or roll back these core features without explicit, unambiguous user confirmation.

## 9. PERMANENT 10 MOVIES INVENTORY (ZERO DATA LOSS)
The library baseline currently contains strictly exactly 10 movies, each with strictly exactly 10 cast members with 100% studio portraits and instant Telegram Cloud playback:
1. `Bagheera (2024)` (telegramMsgId: 51, 10 cast with studio photos)
2. `Atharva (2023)` (telegramMsgId: 49, 10 cast with studio photos)
3. `Anjaam Pathiraa (2020)` (telegramMsgId: 42, 10 cast with studio photos)
4. `Aranmanai 4 (2024)` (telegramMsgId: 44, 10 cast with studio photos)
5. `Animal (2023)` (telegramMsgId: 40, 10 cast with studio photos)
6. `Amaran (2024)` (telegramMsgId: 37, 10 cast with studio photos)
7. `Akhanda 2 - Thaandavam (2025)` (telegramMsgId: 38, 10 cast with studio photos)
8. `Abraham Ozler (2024)` (telegramMsgId: 32, 10 cast with studio photos)
9. `Aavesham (2024)` (telegramMsgId: 27, 10 cast with studio photos)
10. `A.R.M (2024)` (telegramMsgId: 30, 10 cast with studio photos)
- Under no circumstances may any automated sync or script drop or overwrite any of these 10 movies.


