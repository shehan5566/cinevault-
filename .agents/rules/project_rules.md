# CineVault Permanent Project Rules & Memory

## 1. MANDATORY RULE: MINIMUM 10 CAST MEMBERS FOR EVERY MOVIE (ALWAYS)
- **EVERY movie** added, edited, or displayed in CineVault MUST ALWAYS have **at least 10 cast members** (`cast.length >= 10`).
- NEVER save, display, or return a movie with fewer than 10 actors.
- If TMDB, IMDb, or Wikipedia returns fewer than 10 actors initially, the backend must query additional sources (Wikipedia Cast section, TMDB credits, OMDb) to expand the list to at least 10 verified actors.

## 2. PROFESSIONAL STUDIO ACTOR PORTRAITS ONLY
- Cast avatars in `#modalCastAvatars` must display clean, high-resolution, solo studio portraits or official headshots.
- NEVER use scene screenshots, group photos, or low-res thumbnails.
- All actor portraits are cached in `data/actor_cache.json` and proxied through `/api/image-proxy` to eliminate CORS / hotlinking blocks.

## 3. ZERO LOCAL DISK SPACE & STORAGE EFFICIENCY
- Never fill the user's local PC hard drive with heavy movie files.
- Videos are stored in Telegram Cloud Storage and the local temporary file must be unlinked immediately after upload.
- Keep the local PC storage at 0 MB.
