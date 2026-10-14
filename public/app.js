// APP STATE & GLOBALS
let moviesData = [];
let currentMovie = null;
let activeTab = 'all';
let viewMode = 'grid'; // 'grid' or 'list'
let progressSaveInterval = null;

// 4K ULTRA-HD POSTER AUTOMATIC RESOLUTION UPGRADER
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

// DOM ELEMENTS
const authOverlay = document.getElementById('authOverlay');
const loginForm = document.getElementById('loginForm');
const btnLogout = document.getElementById('btnLogout');

const navLinks = document.querySelectorAll('.nav-link');
const moviesContainer = document.getElementById('moviesContainer');

const searchInput = document.getElementById('searchInput');
const clearSearch = document.getElementById('clearSearch');
const genreFilter = document.getElementById('genreFilter');
const qualityFilter = document.getElementById('qualityFilter');
const sortFilter = document.getElementById('sortFilter');
const viewGridBtn = document.getElementById('viewGrid');
const viewListBtn = document.getElementById('viewList');

const playerModal = document.getElementById('playerModal');
const closePlayerModal = document.getElementById('closePlayerModal');
const mainVideoPlayer = document.getElementById('mainVideoPlayer');
const videoSource = document.getElementById('videoSource');
const videoSubtitleTrack = document.getElementById('videoSubtitleTrack');

const modalPosterImg = document.getElementById('modalPosterImg');
const modalBadges = document.getElementById('modalBadges');
const modalTitle = document.getElementById('modalTitle');
const modalYear = document.getElementById('modalYear');
const modalDirector = document.getElementById('modalDirector');
const modalLanguage = document.getElementById('modalLanguage');
const modalCastAvatars = document.getElementById('modalCastAvatars');
const modalNotes = document.getElementById('modalNotes');
const modalDownloadStack = document.getElementById('modalDownloadStack');

const modalFavBtn = document.getElementById('modalFavBtn');
const modalWatchedBtn = document.getElementById('modalWatchedBtn');

const uploadModal = document.getElementById('uploadModal');
const btnUploadModal = document.getElementById('btnUploadModal');
const closeUploadModal = document.getElementById('closeUploadModal');
const uploadForm = document.getElementById('uploadForm');
const dropzoneVideo = document.getElementById('dropzoneVideo');
const videoFileInput = document.getElementById('videoFileInput');
const videoFileName = document.getElementById('videoFileName');
const posterFileInput = document.getElementById('posterFileInput');
const btnSelectPoster = document.getElementById('btnSelectPoster');
const subtitleFileInput = document.getElementById('subtitleFileInput');
const uploadProgressContainer = document.getElementById('uploadProgressContainer');
const uploadProgressBar = document.getElementById('uploadProgressBar');
const uploadTrackIndicator = document.getElementById('uploadTrackIndicator');
const uploadStatusText = document.getElementById('uploadStatusText');
const uploadPercentage = document.getElementById('uploadPercentage');

// INITIALIZATION
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  fetchMovies();
  setupEventListeners();
  setupEditMovieModal();
});

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setupEditMovieModal();
}

// AUTHENTICATION LOGIC
function checkAuth() {
  const isLoggedIn = localStorage.getItem('cinevault_auth');
  const overlay = document.getElementById('authOverlay');
  if (isLoggedIn === 'true') {
    if (overlay) {
      overlay.classList.remove('active');
      overlay.style.display = 'none';
    }
  } else {
    if (overlay) {
      overlay.classList.add('active');
      overlay.style.display = 'flex';
    }
  }
}

window.handleLogin = function(e) {
  if (e) e.preventDefault();
  localStorage.setItem('cinevault_auth', 'true');
  const overlay = document.getElementById('authOverlay');
  if (overlay) {
    overlay.classList.remove('active');
    overlay.style.display = 'none';
  }
  fetchMovies();
};

if (btnLogout) {
  btnLogout.addEventListener('click', () => {
    localStorage.removeItem('cinevault_auth');
    const overlay = document.getElementById('authOverlay');
    if (overlay) {
      overlay.classList.add('active');
      overlay.style.display = 'flex';
    }
  });
}

// FETCH MOVIES FROM BACKEND
async function fetchMovies() {
  try {
    const search = searchInput.value;
    const genre = genreFilter.value;
    const quality = qualityFilter.value;
    const sort = sortFilter.value;

    let url = `/api/movies?sort=${sort}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (genre !== 'all') url += `&genre=${encodeURIComponent(genre)}`;
    if (quality !== 'all') url += `&quality=${encodeURIComponent(quality)}`;

    const response = await fetch(url);
    moviesData = await response.json();

    if (activeTab === 'tamil') {
      moviesData = moviesData.filter(m => (m.language && m.language.toLowerCase() === 'tamil') || (m.genre && m.genre.includes('Tamil')));
    } else if (activeTab === 'hindi') {
      moviesData = moviesData.filter(m => (m.language && m.language.toLowerCase() === 'hindi') || (m.genre && m.genre.includes('Hindi')));
    } else if (activeTab === 'english') {
      moviesData = moviesData.filter(m => (m.language && m.language.toLowerCase() === 'english') || (!m.language && m.type !== 'tv'));
    } else if (activeTab === 'tv') {
      moviesData = moviesData.filter(m => m.type === 'tv' || (m.genre && m.genre.includes('TV')));
    }

    renderMoviesGrid();
  } catch (err) {
    console.error('Error fetching movies:', err);
  }
}

function getShortQuality(quality) {
  if (!quality) return 'WEB-DL';
  const q = quality.toUpperCase();
  if (q.includes('BLURAY')) return 'BLURAY';
  if (q.includes('WEB')) return 'WEB-DL';
  if (q.includes('4K')) return '4K';
  if (q.includes('HDRIP')) return 'HDRIP';
  return q.split(' ').pop() || 'WEB-DL';
}

function formatTitleWithYear(rawTitle, year) {
  if (!rawTitle) return '';
  const cleanTitle = rawTitle.replace(/\s*\(\d{4}\)\s*$/g, '').trim();
  if (year) {
    return `${cleanTitle} (${year})`;
  }
  return cleanTitle;
}

// HELPER: CREATE POSTER CARD HTML
function createPosterCardHTML(movie) {
  const displayTitle = formatTitleWithYear(movie.title, movie.year);
  return `
    <div class="movie-card" onclick="openPlayerModalById('${movie.id}')">
      <div class="movie-poster-wrap">
        <img src="${upgradeTo4KPoster(movie.posterUrl)}" alt="${movie.title}" onerror="this.src='https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=600&auto=format&fit=crop'">
        
        <div class="poster-corner-badges">
          <span class="badge-quality-corner">${getShortQuality(movie.quality)}</span>
        </div>

        <div class="imdb-rating-badge">
          <i class="fa-solid fa-star"></i> ${movie.imdbRating}
        </div>
        
        <div class="poster-bottom-title">
          ${displayTitle}
        </div>
      </div>
    </div>
  `;
}

// RENDER MOVIES GRID
function renderMoviesGrid() {
  if (!moviesContainer) return;

  if (moviesData.length === 0) {
    moviesContainer.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 60px; color: var(--text-secondary);">
        <i class="fa-solid fa-film" style="font-size: 3rem; margin-bottom: 16px; opacity: 0.5;"></i>
        <h3>No titles found</h3>
        <p>Try adjusting your search or filters, or upload a new movie to your collection!</p>
      </div>
    `;
    return;
  }

  moviesContainer.className = `movies-grid ${viewMode === 'list' ? 'list-view' : ''}`;
  moviesContainer.innerHTML = moviesData.map(createPosterCardHTML).join('');
}

let plyrInstance = null;
let hlsInstance = null;

function setupPlyrWithHls(srcUrl) {
  const video = document.getElementById('mainVideoPlayer');
  if (!video) return;

  if (window.Hls && Hls.isSupported() && srcUrl && srcUrl.endsWith('.m3u8')) {
    if (hlsInstance) hlsInstance.destroy();
    hlsInstance = new Hls();
    hlsInstance.loadSource(srcUrl);
    hlsInstance.attachMedia(video);
    hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
      const availableQualities = hlsInstance.levels.map((l) => l.height);
      if (plyrInstance) plyrInstance.destroy();
      plyrInstance = new Plyr(video, {
        controls: ['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'captions', 'settings', 'pip', 'airplay', 'fullscreen'],
        settings: ['captions', 'quality', 'speed'],
        quality: {
          default: availableQualities[0] || 1080,
          options: availableQualities,
          forced: true,
          onChange: (newQuality) => {
            if (hlsInstance) {
              hlsInstance.levels.forEach((level, levelIndex) => {
                if (level.height === newQuality) {
                  hlsInstance.currentLevel = levelIndex;
                }
              });
            }
          }
        }
      });
    });
  } else {
    if (!plyrInstance && window.Plyr) {
      plyrInstance = new Plyr(video, {
        controls: ['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'captions', 'settings', 'pip', 'airplay', 'fullscreen'],
        settings: ['captions', 'quality', 'speed'],
        captions: { active: true, language: 'auto', update: true },
        seekTime: 10,
        keyboard: { focused: true, global: true },
        quality: {
          default: 1080,
          options: [2160, 1080, 720, 480],
          forced: true
        },
        speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] }
      });

      plyrInstance.on('play', () => {
        try {
          plyrInstance.toggleCaptions(true);
          if (plyrInstance.captions) plyrInstance.captions.active = true;
          if (video.textTracks && video.textTracks.length > 0) {
            for (let i = 0; i < video.textTracks.length; i++) {
              video.textTracks[i].mode = 'showing';
            }
          }
        } catch(e) {}
      });
    }
  }
}

// HELPER FOR VISUAL SEEK OVERLAY BADGES (+10s / -10s / Play / Pause)
function showSeekBadge(type, htmlContent) {
  const container = document.getElementById('csVideoContainer') || document.body;
  let badge = document.getElementById('seekOverlayBadge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'seekOverlayBadge';
    container.appendChild(badge);
  }

  badge.className = `seek-overlay-badge ${type} visible`;
  badge.innerHTML = htmlContent;

  clearTimeout(window.seekBadgeTimeout);
  window.seekBadgeTimeout = setTimeout(() => {
    badge.classList.remove('visible');
  }, 650);
}

// HELPER FOR DYNAMIC SUBTITLE LOADING & ENABLING
function setPlayerSubtitle(subtitleUrl) {
  const video = document.getElementById('mainVideoPlayer');
  if (!video) return;

  const existingTracks = video.querySelectorAll('track');
  existingTracks.forEach(t => t.remove());

  if (subtitleUrl && subtitleUrl.trim() !== '') {
    // Add cache buster so browser never serves stale cached subtitle
    const cacheBuster = subtitleUrl.includes('?') ? '&v=' + Date.now() : '?v=' + Date.now();
    const finalUrl = subtitleUrl + cacheBuster;

    const track = document.createElement('track');
    track.id = 'videoSubtitleTrack';
    track.kind = 'subtitles';
    track.label = 'Sinhala';
    track.srclang = 'si';
    track.src = finalUrl;
    track.default = true;
    video.appendChild(track);

    const activateTracks = () => {
      if (video.textTracks && video.textTracks.length > 0) {
        for (let i = 0; i < video.textTracks.length; i++) {
          video.textTracks[i].mode = 'showing';
        }
      }
      if (plyrInstance) {
        try {
          plyrInstance.toggleCaptions(true);
          if (plyrInstance.captions) plyrInstance.captions.active = true;
        } catch (e) {}
      }
    };

    track.addEventListener('load', activateTracks);
    setTimeout(activateTracks, 200);
    setTimeout(activateTracks, 800);
    setTimeout(activateTracks, 1800);
  }
}

// KEYBOARD ARROW SHORTCUTS FOR PLYR HD (ARROW RIGHT +10s / ARROW LEFT -10s / SPACEBAR TOGGLE)
window.addEventListener('keydown', (e) => {
  const playerModal = document.getElementById('playerModal');
  if (!playerModal || !playerModal.classList.contains('active')) return;
  // Ignore when user is typing in inputs or textareas
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

  const video = document.getElementById('mainVideoPlayer');
  if (!video || video.style.display === 'none') return;

  if (e.key === 'ArrowRight') {
    e.preventDefault();
    video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10);
    showSeekBadge('right', '<i class="fa-solid fa-rotate-right"></i> +10s');
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    video.currentTime = Math.max(0, video.currentTime - 10);
    showSeekBadge('left', '<i class="fa-solid fa-rotate-left"></i> -10s');
  } else if (e.key === ' ') {
    e.preventDefault();
    if (video.paused) {
      video.play();
      showSeekBadge('center', '<i class="fa-solid fa-play"></i> Play');
    } else {
      video.pause();
      showSeekBadge('center', '<i class="fa-solid fa-pause"></i> Pause');
    }
  }
});

document.addEventListener('DOMContentLoaded', () => {
  setupPlyrWithHls('');
});

// SWITCH TO ONLINE CLOUD FULL MOVIE STREAMING (WHEN LOCAL FILE IS DELETED OR MISSING)
async function switchToCloudStream(movie, engine = 'cs') {
  if (!movie) return;
  const mainVideoPlayer = document.getElementById('mainVideoPlayer');
  const backdropOverlay = document.getElementById('videoBackdropOverlay');
  const youtubeIframe = document.getElementById('youtubeTrailerIframe');

  if (mainVideoPlayer) {
    mainVideoPlayer.pause();
    const plyrEl = document.querySelector('.plyr');
    if (plyrEl) plyrEl.style.display = 'none';
    else mainVideoPlayer.style.display = 'none';
  }
  if (backdropOverlay) backdropOverlay.classList.add('hidden');

  if (youtubeIframe) {
    youtubeIframe.removeAttribute('sandbox');
    youtubeIframe.style.display = 'block';

    // If imdbId is missing on movie object, dynamically auto-resolve via backend metadata
    if (!movie.imdbId && movie.title) {
      try {
        const metaRes = await fetch(`/api/fetch-metadata?title=${encodeURIComponent(movie.title)}`);
        const metaData = await metaRes.json();
        if (metaData && metaData.imdbId) {
          movie.imdbId = metaData.imdbId;
        }
      } catch (err) {
        console.log('IMDb ID auto-resolve error:', err);
      }
    }

    const targetImdb = movie.imdbId || 'tt37535100';

    if (engine === 'super') {
      youtubeIframe.src = `https://embed.smashystream.com/playere.php?imdb=${targetImdb}`;
    } else if (engine === 'evo') {
      // Server 3: Evo 2Embed VIP Player
      youtubeIframe.src = `https://www.2embed.cc/embed/${targetImdb}`;
    } else {
      youtubeIframe.src = `https://vidsrc.me/embed/movie?imdb=${targetImdb}`;
    }
  }
}

function getWideBackdropUrl(movie) {
  if (movie.backdropUrl && movie.backdropUrl.trim() !== '') {
    return movie.backdropUrl;
  }
  if (movie.posterUrl && movie.posterUrl.includes('image.tmdb.org')) {
    return movie.posterUrl.replace('/w780/', '/w1280/');
  }
  const cinematicBackdrops = [
    'https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=1600&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=1600&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?q=80&w=1600&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=1600&auto=format&fit=crop'
  ];
  const charCodeSum = (movie.id || movie.title || 'mov').split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return cinematicBackdrops[charCodeSum % cinematicBackdrops.length];
}

// OPEN CINESUBZ DETAILS MODAL (SCREENSHOT EXACT MATCH)
function openPlayerModalById(id, resumeTimestamp = null) {
  const movie = moviesData.find(m => m.id === id);
  if (movie) openPlayerModal(movie, resumeTimestamp);
}

function openPlayerModal(movie, resumeTimestamp = null) {
  currentMovie = movie;
window.renderMovieModal = openPlayerModal;
window.openPlayerModal = openPlayerModal;

  const displayTitleWithYear = formatTitleWithYear(movie.title, movie.year);

  // BREADCRUMB TITLE
  const modalBreadcrumbTitle = document.getElementById('modalBreadcrumbTitle');
  if (modalBreadcrumbTitle) {
    modalBreadcrumbTitle.textContent = displayTitleWithYear;
  }

  // BACKDROP OVERLAY & BIG PLAY BUTTON
  const backdropOverlay = document.getElementById('videoBackdropOverlay');
  const modalBackdropImg = document.getElementById('modalBackdropImg');
  if (modalBackdropImg) {
    modalBackdropImg.src = upgradeTo4KPoster(movie.posterUrl) || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=1200&auto=format&fit=crop';
  }
  if (backdropOverlay) backdropOverlay.classList.remove('hidden');

  const btnBigPlay = document.getElementById('btnBigPlay');
  if (btnBigPlay) {
    btnBigPlay.onclick = () => {
      if (backdropOverlay) backdropOverlay.classList.add('hidden');
      const effVideoUrl = movie.videoUrl || (movie.telegramMsgId ? `/api/telegram/file/${movie.telegramMsgId}` : '');
      if (effVideoUrl && effVideoUrl.trim() !== '') {
        const plyrEl = document.querySelector('.plyr');
        if (plyrEl) plyrEl.style.display = 'block';
        if (mainVideoPlayer) mainVideoPlayer.style.display = 'block';
        if (videoSource && (!videoSource.src || !videoSource.src.includes(effVideoUrl))) {
          videoSource.src = effVideoUrl;
          mainVideoPlayer.load();
        }
        if (plyrInstance) {
          try {
            plyrInstance.toggleCaptions(true);
            if (plyrInstance.captions) plyrInstance.captions.active = true;
          } catch (e) {}
        }
        mainVideoPlayer.play().catch(e => {
          console.log('Playback start notice:', e);
        });
        setTimeout(() => {
          if (plyrInstance) {
            try {
              plyrInstance.toggleCaptions(true);
              if (plyrInstance.captions) plyrInstance.captions.active = true;
            } catch (e) {}
          }
        }, 500);
      } else {
        alert('⚠️ මෙම චිත්‍රපටය සඳහා වීඩියෝ ගොනුවක් තවමත් Upload කර නොමැත. කරුණාකර වීඩියෝව Upload කරන්න.');
      }
    };
  }

  // FLOATING CIRCULAR ACTION BUTTONS
  const btnFloatDownload = document.getElementById('btnFloatDownload');
  if (btnFloatDownload) {
    btnFloatDownload.onclick = () => downloadMovieWithSubtitles(movie.id);
  }

  const btnFloatFullscreen = document.getElementById('btnFloatFullscreen');
  if (btnFloatFullscreen) {
    btnFloatFullscreen.onclick = () => {
      if (backdropOverlay) backdropOverlay.classList.add('hidden');
      const plyrEl = document.querySelector('.plyr');
      if (plyrEl && plyrEl.style.display !== 'none' && plyrInstance) {
        plyrInstance.fullscreen.enter();
      } else if (mainVideoPlayer && mainVideoPlayer.style.display !== 'none') {
        if (mainVideoPlayer.requestFullscreen) mainVideoPlayer.requestFullscreen();
        else if (mainVideoPlayer.webkitRequestFullscreen) mainVideoPlayer.webkitRequestFullscreen();
      } else {
        const youtubeIframe = document.getElementById('youtubeTrailerIframe');
        if (youtubeIframe && youtubeIframe.requestFullscreen) youtubeIframe.requestFullscreen();
      }
    };
  }

  const btnFloatSubtitles = document.getElementById('btnFloatSubtitles');
  if (btnFloatSubtitles) {
    btnFloatSubtitles.onclick = () => {
      if (mainVideoPlayer.textTracks && mainVideoPlayer.textTracks.length > 0) {
        const track = mainVideoPlayer.textTracks[0];
        track.mode = track.mode === 'showing' ? 'hidden' : 'showing';
        alert(`Subtitles ${track.mode === 'showing' ? 'Enabled' : 'Disabled'}`);
      } else {
        alert('No embedded subtitle track available.');
      }
    };
  }

  const btnFloatReport = document.getElementById('btnFloatReport');
  if (btnFloatReport) {
    btnFloatReport.onclick = () => alert('⚠️ Streaming report submitted to server administrator.');
  }

  // QUICK SUBTITLE ATTACH HANDLER (.SRT / .VTT)
  const btnQuickAttachSub = document.getElementById('btnQuickAttachSub');
  const quickSubFileInput = document.getElementById('quickSubFileInput');

  if (btnQuickAttachSub && quickSubFileInput) {
    btnQuickAttachSub.onclick = (e) => {
      e.stopPropagation();
      quickSubFileInput.click();
    };

    quickSubFileInput.onchange = async () => {
      const file = quickSubFileInput.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append('subtitle', file);

      showSeekBadge('info', `<i class="fa-solid fa-spinner fa-spin"></i> Converting ${file.name}...`);

      try {
        const res = await fetch('/api/upload-subtitle-single', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (data.success && data.subtitleUrl) {
          setPlayerSubtitle(data.subtitleUrl);
          showSeekBadge('info', `<i class="fa-solid fa-check text-success"></i> Subtitle Attached!`);
        } else {
          alert('Failed to process subtitle file.');
        }
      } catch (err) {
        alert('Subtitle upload error: ' + err.message);
      }
    };
  }

  // SERVER SWITCHER PILLS (CS Player, SuperEmbed, Evo Player, Youtube Trailer)
  const serverPills = document.querySelectorAll('.cs-server-pill');
  const youtubeIframe = document.getElementById('youtubeTrailerIframe');

  serverPills.forEach(pill => {
    pill.onclick = () => {
      serverPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const serverType = pill.getAttribute('data-server');

      if (serverType === 'youtube') {
        // Switch to YouTube Trailer Player
        if (mainVideoPlayer) {
          mainVideoPlayer.pause();
          const plyrEl = document.querySelector('.plyr');
          if (plyrEl) plyrEl.style.display = 'none';
          else mainVideoPlayer.style.display = 'none';
        }
        if (backdropOverlay) backdropOverlay.classList.add('hidden');
        if (youtubeIframe) {
          youtubeIframe.removeAttribute('sandbox');
          youtubeIframe.style.display = 'block';
          fetch(`/api/youtube-trailer?title=${encodeURIComponent(movie.title)}`)
            .then(res => res.json())
            .then(data => {
              if (data && data.embedUrl) {
                youtubeIframe.src = data.embedUrl + (data.embedUrl.includes('?') ? '&autoplay=1' : '?autoplay=1');
              }
            })
            .catch(err => {
              console.log('YT Trailer fetch error:', err);
              youtubeIframe.src = `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(movie.title + ' official trailer')}`;
            });
        }
      } else if (serverType === 'super') {
        // Switch to SuperEmbed Multi-Server Hub (Server 2)
        switchToCloudStream(movie, 'super');
      } else if (serverType === 'evo') {
        // Switch to Evo Fast Cloud Engine (Server 3)
        switchToCloudStream(movie, 'evo');
      } else {
        // Default CS Player (Plyr HD Server 1 - 100% Original Quality)
        if (youtubeIframe) {
          youtubeIframe.src = '';
          youtubeIframe.style.display = 'none';
        }
        const plyrEl = document.querySelector('.plyr');
        if (plyrEl) plyrEl.style.display = 'block';
        else if (mainVideoPlayer) mainVideoPlayer.style.display = 'block';

        if (movie.videoUrl && movie.videoUrl.trim() !== '') {
          videoSource.src = movie.videoUrl;
          mainVideoPlayer.load();

          if (backdropOverlay) backdropOverlay.classList.add('hidden');
          mainVideoPlayer.play().catch(e => {
            console.log('CS play notice:', e);
          });
        }
      }
    };
  });

  // Keep uploaded local video file active without auto-overriding
  mainVideoPlayer.onerror = (e) => {
    console.log('Video playback event:', e);
  };
  if (videoSource) {
    videoSource.onerror = (e) => {
      console.log('Video source event:', e);
    };
  }

  // Set up PlyrHD as the main player
  if (youtubeIframe) {
    youtubeIframe.src = '';
    youtubeIframe.style.display = 'none';
  }
  const plyrEl = document.querySelector('.plyr');
  if (plyrEl) plyrEl.style.display = 'block';
  else if (mainVideoPlayer) mainVideoPlayer.style.display = 'block';

  const effVideoUrl = movie.videoUrl || (movie.telegramMsgId ? `/api/telegram/file/${movie.telegramMsgId}` : '');
  if (effVideoUrl && effVideoUrl.trim() !== '') {
    videoSource.src = effVideoUrl;
  } else {
    videoSource.src = '';
  }

  mainVideoPlayer.autoplay = false;
  mainVideoPlayer.removeAttribute('autoplay');
  mainVideoPlayer.pause();
  mainVideoPlayer.load();
  mainVideoPlayer.pause();
  mainVideoPlayer.autoplay = false;

  if (movie.subtitleUrl) {
    setPlayerSubtitle(movie.subtitleUrl);
  } else {
    setPlayerSubtitle('');
  }

  mainVideoPlayer.currentTime = 0; // Always start movie from the very beginning (0:00)

  if (modalPosterImg) modalPosterImg.src = upgradeTo4KPoster(movie.posterUrl) || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=1200&auto=format&fit=crop';
  modalTitle.textContent = formatTitleWithYear(movie.title, movie.year);
  if (typeof modalNotes !== 'undefined' && modalNotes) modalNotes.textContent = movie.notes || '';

  // RENDER TV SERIES SEASONS & EPISODES IF TYPE IS TV OR SEASONS PRESENT
  const csTvContainer = document.getElementById('csTvContainer');
  const csSeasonTabs = document.getElementById('csSeasonTabs');
  const csEpisodeGrid = document.getElementById('csEpisodeGrid');
  const tvEpCountBadge = document.getElementById('tvEpCountBadge');

  if (csTvContainer) {
    if (movie.type === 'tv' || (movie.seasons && movie.seasons.length > 0)) {
      csTvContainer.style.display = 'block';

      // Fallback/Default Seasons if not structured
      let seasonsData = movie.seasons || [
        {
          seasonNumber: 1,
          title: "Season 1",
          episodes: [
            { episodeNumber: 1, title: `${movie.title} - Episode 1`, duration: movie.duration || "45 min", videoUrl: movie.videoUrl },
            { episodeNumber: 2, title: `${movie.title} - Episode 2`, duration: "50 min", videoUrl: movie.videoUrl },
            { episodeNumber: 3, title: `${movie.title} - Episode 3`, duration: "48 min", videoUrl: movie.videoUrl }
          ]
        },
        {
          seasonNumber: 2,
          title: "Season 2",
          episodes: [
            { episodeNumber: 1, title: `${movie.title} - S02E01`, duration: "52 min", videoUrl: movie.videoUrl },
            { episodeNumber: 2, title: `${movie.title} - S02E02`, duration: "49 min", videoUrl: movie.videoUrl }
          ]
        }
      ];

      if (tvEpCountBadge) tvEpCountBadge.textContent = `${seasonsData.length} Seasons`;

      const renderSeasonEpisodes = (seasonIdx) => {
        const currentSeason = seasonsData[seasonIdx] || seasonsData[0];
        
        // Render Season Tabs
        if (csSeasonTabs) {
          csSeasonTabs.innerHTML = seasonsData.map((s, idx) => `
            <button type="button" class="cs-season-pill ${idx === seasonIdx ? 'active' : ''}" data-season-idx="${idx}">
              <i class="fa-solid fa-folder-open"></i> ${s.title || `Season ${s.seasonNumber || idx + 1}`} (${s.episodes ? s.episodes.length : 0} Ep)
            </button>
          `).join('');

          csSeasonTabs.querySelectorAll('.cs-season-pill').forEach(btn => {
            btn.onclick = () => {
              const idx = parseInt(btn.getAttribute('data-season-idx'));
              renderSeasonEpisodes(idx);
            };
          });
        }

        // Render Episode Cards
        if (csEpisodeGrid) {
          const episodes = currentSeason.episodes || [];
          if (episodes.length === 0) {
            csEpisodeGrid.innerHTML = '<p class="text-muted" style="font-size:0.85rem;">No episodes added for this season yet.</p>';
          } else {
            csEpisodeGrid.innerHTML = episodes.map((ep, epIdx) => `
              <div class="cs-episode-card" data-ep-idx="${epIdx}">
                <div class="cs-ep-num">E${ep.episodeNumber || epIdx + 1}</div>
                <div class="cs-ep-info">
                  <div class="cs-ep-title">${ep.title || `Episode ${ep.episodeNumber || epIdx + 1}`}</div>
                  <div class="cs-ep-meta"><i class="fa-regular fa-clock"></i> ${ep.duration || '45 min'}</div>
                </div>
                <div class="cs-ep-play-btn" title="Play Episode"><i class="fa-solid fa-play"></i></div>
              </div>
            `).join('');

            csEpisodeGrid.querySelectorAll('.cs-episode-card').forEach(card => {
              card.onclick = () => {
                csEpisodeGrid.querySelectorAll('.cs-episode-card').forEach(c => c.classList.remove('active-ep'));
                card.classList.add('active-ep');
                const epIdx = parseInt(card.getAttribute('data-ep-idx'));
                const epData = episodes[epIdx];
                
                if (epData) {
                  if (backdropOverlay) backdropOverlay.classList.add('hidden');
                  const epUrl = epData.videoUrl || movie.videoUrl;
                  const epSubUrl = epData.subtitleUrl || movie.subtitleUrl || '';
                  if (epUrl && epUrl.trim() !== '') {
                    const plyrEl = document.querySelector('.plyr');
                    if (plyrEl) plyrEl.style.display = 'block';
                    else if (mainVideoPlayer) mainVideoPlayer.style.display = 'block';

                    videoSource.src = epUrl;
                    setPlayerSubtitle(epSubUrl);
                    mainVideoPlayer.load();
                    mainVideoPlayer.play().catch(e => console.log('Ep play error:', e));
                  } else {
                    switchToCloudStream(movie, 'cs');
                  }
                }
              };
            });
          }
        }
      };

      renderSeasonEpisodes(0);
    } else {
      csTvContainer.style.display = 'none';
    }
  }

  // RENDER CAST AVATARS WITH REAL ACTOR IMAGE AUTO-SEARCH (EXACTLY 10 CAST MEMBERS)
  const castList = (Array.isArray(movie.cast) ? movie.cast : (movie.cast ? movie.cast.split(',') : [])).slice(0, 10);
  if (castList.length === 0) {
    modalCastAvatars.innerHTML = '<p class="text-muted" style="font-size:0.85rem;">No cast members listed for this movie.</p>';
  } else {
    window.actorClientCache = window.actorClientCache || {};

    modalCastAvatars.innerHTML = castList.map((actor, idx) => {
      const cleanActor = actor.trim();
      if (!cleanActor) return '';
      const avatarImgId = `cast-avatar-img-${idx}-${Date.now()}`;
      const initialFallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(cleanActor)}&background=181826&color=e50914&size=300&bold=true`;
      
      const directMovieImg = movie.castImages && (movie.castImages[cleanActor] || movie.castImages[cleanActor.toLowerCase()]);
      const proxiedDirectImg = directMovieImg ? `/api/image-proxy?url=${encodeURIComponent(directMovieImg)}` : null;
      const cached = proxiedDirectImg || window.actorClientCache[cleanActor.toLowerCase()];
      const initialSrc = cached || initialFallback;

      if (!cached) {
        // Asynchronously fetch real actor photo
        fetch(`/api/actor-avatar?name=${encodeURIComponent(cleanActor)}`)
          .then(res => res.json())
          .then(data => {
            const imgElement = document.getElementById(avatarImgId);
            if (imgElement && data) {
              const bestUrl = data.proxyUrl || data.imageUrl;
              if (bestUrl && !bestUrl.includes('ui-avatars.com')) {
                window.actorClientCache[cleanActor.toLowerCase()] = bestUrl;
                imgElement.src = bestUrl;
              }
            }
          })
          .catch(err => console.log('Actor photo fetch error:', err));
      }

      const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(cleanActor + ' actor')}`;
      return `
        <a href="${googleSearchUrl}" target="_blank" rel="noopener noreferrer" class="cs-cast-card" title="Click to view ${cleanActor} on Google">
          <img id="${avatarImgId}" src="${initialSrc}" class="cs-cast-avatar" alt="${cleanActor}" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src='${initialFallback}'">
          <div class="cs-cast-name">${cleanActor}</div>
        </a>
      `;
    }).join('');
  }

  // SINGLE VIDEO DOWNLOAD (SUBTITLE EMBEDDED IN VIDEO CONTAINER)
  window.downloadMovieWithSubtitles = function(movieId) {
    const targetMovie = moviesData.find(m => m.id === movieId);
    if (!targetMovie) return;

    // Direct Single Video Download
    const movieLink = document.createElement('a');
    movieLink.href = `/api/download/${targetMovie.id}`;
    movieLink.download = `${targetMovie.title} [${getShortQuality(targetMovie.quality)}].mkv`;
    document.body.appendChild(movieLink);
    movieLink.click();
    document.body.removeChild(movieLink);
  };

  // RENDER SINGLE DIRECT DOWNLOAD BUTTON (EMBEDDED SUBTITLE, ZERO SEPARATE BUTTONS)
  modalDownloadStack.innerHTML = `
    <a href="/api/download/${movie.id}" class="movie-download-button" download="${movie.title} [${getShortQuality(movie.quality)}].mkv">
      <div class="movie-download-icon"><i class="fa-solid fa-arrow-down"></i></div>
      <div class="movie-download-info">
        <span class="movie-download-type">Direct Download</span>
        <span class="movie-download-meta">${getShortQuality(movie.quality)} ${movie.fileSize || '2.0 GB'} • ${movie.language || 'Tamil'}</span>
      </div>
    </a>
  `;

  modalFavBtn.innerHTML = movie.isFavorite ? '<i class="fa-solid fa-star text-yellow"></i> Favorited' : '<i class="fa-regular fa-star"></i> Favorite';
  modalFavBtn.onclick = () => {
    toggleFavorite(movie.id);
    modalFavBtn.innerHTML = !movie.isFavorite ? '<i class="fa-solid fa-star text-yellow"></i> Favorited' : '<i class="fa-regular fa-star"></i> Favorite';
  };

  modalWatchedBtn.innerHTML = movie.watched ? '<i class="fa-solid fa-circle-check text-success"></i> Watched' : '<i class="fa-regular fa-circle-check"></i> Mark Watched';
  modalWatchedBtn.onclick = async () => {
    movie.watched = !movie.watched;
    await updateMovieOnServer(movie.id, { watched: movie.watched });
    fetchMovies();
    modalWatchedBtn.innerHTML = movie.watched ? '<i class="fa-solid fa-circle-check text-success"></i> Watched' : '<i class="fa-regular fa-circle-check"></i> Mark Watched';
  };

  // CATEGORY TAB RE-ASSIGN PILLS
  const modalCategoryPills = document.getElementById('modalCategoryPills');
  if (modalCategoryPills) {
    const activeVal = movie.type === 'tv' ? 'tv' : (movie.language || 'English');
    const pillBtns = modalCategoryPills.querySelectorAll('.cat-pill-btn');

    pillBtns.forEach(btn => {
      const val = btn.getAttribute('data-val');
      if (val === activeVal) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }

      btn.onclick = async () => {
        pillBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        let newType = 'movie';
        let newLang = val;

        if (val === 'tv') {
          newType = 'tv';
          newLang = movie.language || 'English';
        }

        movie.type = newType;
        movie.language = newLang;

        await updateMovieOnServer(movie.id, { type: newType, language: newLang });
        fetchMovies();
        alert(`📁 Category updated! "${movie.title}" assigned to ${val} Tab.`);
      };
    });
  }

  window.addComment = () => {
    const textEl = document.getElementById('commentText');
    const nameEl = document.getElementById('commentName');
    const listEl = document.getElementById('commentsList');

    if (!textEl || !nameEl || !listEl) return;
    const text = textEl.value.trim();
    const name = nameEl.value.trim();
    if (!text || !name) return;

    const item = document.createElement('div');
    item.className = 'comment-item';
    item.innerHTML = `
      <div class="comment-header">
        <span>${name}</span>
        <span class="comment-time">Just now</span>
      </div>
      <div class="comment-body">${text}</div>
    `;
    listEl.prepend(item);
    textEl.value = '';
    alert('💬 Comment posted successfully!');
  };

  // EDIT HANDLER - OPENS DEDICATED POP-UP MODAL WINDOW
  const modalEditBtn = document.getElementById('modalEditBtn');
  if (modalEditBtn) {
    modalEditBtn.onclick = () => {
      openEditMovieModal(movie);
    };
  }

  // DELETE HANDLER
  const modalDeleteBtn = document.getElementById('modalDeleteBtn');
  if (modalDeleteBtn) {
    modalDeleteBtn.onclick = async () => {
      const confirmed = confirm(`Are you sure you want to delete "${movie.title}" from your private library?`);
      if (!confirmed) return;

      try {
        await fetch(`/api/movies/${movie.id}`, { method: 'DELETE' });
        alert('🗑️ Movie deleted successfully from your library!');
        playerModal.classList.remove('active');
        mainVideoPlayer.pause();
        fetchMovies();
      } catch (err) {
        alert('Failed to delete movie.');
      }
    };
  }

  // FREE PC DISK SPACE HANDLER
  const modalFreeDiskSpaceBtn = document.getElementById('modalFreeDiskSpaceBtn');
  if (modalFreeDiskSpaceBtn) {
    modalFreeDiskSpaceBtn.onclick = async () => {
      const confirmed = confirm(`Are you sure you want to delete the local video file for "${movie.title}" from your PC hard drive to free up space?\n\n(The movie details and YouTube/Telegram streaming links will remain safely in your library!).`);
      if (!confirmed) return;

      try {
        const res = await fetch(`/api/movies/${movie.id}/delete-local-video`, { method: 'POST' });
        const data = await res.json();
        alert(data.message || 'Local PC video file deleted. Hard drive space freed!');
        fetchMovies();
      } catch (err) {
        alert('Failed to free disk space.');
      }
    };
  }

  playerModal.classList.add('active');
  mainVideoPlayer.autoplay = false;
  mainVideoPlayer.removeAttribute('autoplay');
  mainVideoPlayer.pause();

  if (progressSaveInterval) clearInterval(progressSaveInterval);
  progressSaveInterval = setInterval(() => {
    if (mainVideoPlayer && !mainVideoPlayer.paused && currentMovie) {
      updateMovieOnServer(currentMovie.id, {
        progressSeconds: Math.floor(mainVideoPlayer.currentTime)
      });
    }
  }, 5000);
}

// DEDICATED EDIT MOVIE POP-UP MODAL WINDOW HANDLER
window.openEditMovieModal = function(movie) {
  const m = movie || currentMovie;
  if (!m) {
    console.warn('openEditMovieModal called with no movie');
    return;
  }
  const editModal = document.getElementById('editMovieModal');
  if (!editModal) {
    console.error('#editMovieModal element not found in DOM');
    return;
  }

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = (val !== undefined && val !== null) ? val : '';
  };

  setVal('editMovieId', m.id);
  setVal('editMovieTitle', m.title || '');
  setVal('editMovieYear', m.year || new Date().getFullYear());
  setVal('editMoviePosterUrl', m.posterUrl || '');

  const posterPreview = document.getElementById('editPosterPreviewImg');
  if (posterPreview) {
    posterPreview.src = m.posterUrl || '/posters/interstellar.jpg';
  }

  setVal('editMovieDirector', m.director || '');
  setVal('editMovieLanguage', m.language || 'English');
  setVal('editMovieGenre', Array.isArray(m.genre) ? m.genre.join(', ') : (m.genre || ''));
  setVal('editMovieDuration', m.duration || '2h 15m');
  setVal('editMovieImdb', m.imdbRating || 7.0);
  setVal('editMoviePersonalRating', m.personalRating || 7.0);
  setVal('editMovieQuality', m.quality || 'WEB-DL');
  setVal('editMovieCast', Array.isArray(m.cast) ? m.cast.join(', ') : (m.cast || ''));

  editModal.classList.add('active');
};

function openEditMovieModal(movie) {
  window.openEditMovieModal(movie);
}

// SETUP EDIT MOVIE MODAL CONTROLS & SUBMISSION
function setupEditMovieModal() {
  const editModal = document.getElementById('editMovieModal');
  const closeBtn = document.getElementById('closeEditModal');
  const cancelBtn = document.getElementById('btnCancelEdit');
  const posterUrlInput = document.getElementById('editMoviePosterUrl');
  const posterPreview = document.getElementById('editPosterPreviewImg');
  const posterFileInput = document.getElementById('editPosterFileInput');
  const editForm = document.getElementById('editMovieForm');
  const modalEditBtn = document.getElementById('modalEditBtn');

  if (modalEditBtn) {
    modalEditBtn.onclick = (e) => {
      if (e) e.stopPropagation();
      window.openEditMovieModal(currentMovie);
    };
  }

  if (!editModal || !editForm) return;

  const closeEdit = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    editModal.classList.remove('active');
  };

  if (closeBtn) closeBtn.onclick = closeEdit;
  if (cancelBtn) cancelBtn.onclick = closeEdit;

  // Close on backdrop click
  editModal.addEventListener('click', (e) => {
    if (e.target === editModal) closeEdit(e);
  });


  // Real-time poster preview on URL input
  if (posterUrlInput && posterPreview) {
    posterUrlInput.addEventListener('input', () => {
      if (posterUrlInput.value.trim()) {
        posterPreview.src = posterUrlInput.value.trim();
      }
    });
  }

  // Local file upload for poster
  if (posterFileInput && posterPreview && posterUrlInput) {
    posterFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          posterPreview.src = event.target.result;
          posterUrlInput.value = event.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // Handle Edit Form Submission
  editForm.onsubmit = async (e) => {
    e.preventDefault();
    const btnSave = document.getElementById('btnSaveEdit');
    const movieId = document.getElementById('editMovieId').value;
    const title = document.getElementById('editMovieTitle').value.trim();
    const year = parseInt(document.getElementById('editMovieYear').value) || 2024;
    const posterUrl = document.getElementById('editMoviePosterUrl').value.trim();
    const director = document.getElementById('editMovieDirector').value.trim();
    const language = document.getElementById('editMovieLanguage').value;
    const genreStr = document.getElementById('editMovieGenre').value.trim();
    const duration = document.getElementById('editMovieDuration').value.trim();
    const imdbRating = parseFloat(document.getElementById('editMovieImdb').value) || 7.0;
    const personalRating = parseFloat(document.getElementById('editMoviePersonalRating').value) || 7.0;
    const quality = document.getElementById('editMovieQuality').value;
    const rawCast = document.getElementById('editMovieCast').value.trim();

    let castList = rawCast.split(',').map(c => c.trim()).filter(Boolean);
    if (castList.length < 10) {
      alert('⚠️ Strictly 10 Cast Members Required: Every movie in CineVault must have exactly 10 cast members. Please provide 10 actors.');
      return;
    }
    castList = castList.slice(0, 10);

    const updatedData = {
      title,
      year,
      posterUrl,
      director,
      language,
      genre: genreStr ? genreStr.split(',').map(g => g.trim()) : ['Drama'],
      duration,
      imdbRating,
      personalRating,
      quality,
      cast: castList
    };

    try {
      if (btnSave) btnSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

      await updateMovieOnServer(movieId, updatedData);
      if (btnSave) btnSave.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Changes';

      alert('🎬 Movie details updated successfully!');
      editModal.classList.remove('active');

      await fetchMovies();
      const updatedMovie = moviesData.find(m => m.id === movieId);
      if (updatedMovie) {
        currentMovie = updatedMovie;
        if (playerModal && playerModal.classList.contains('active')) {
          openPlayerModal(updatedMovie);
        }
      }
    } catch (err) {
      if (btnSave) btnSave.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Changes';
      alert('Error updating movie: ' + err.message);
    }
  };
}

const closePlayerFn = () => {
  playerModal.classList.remove('active');
  mainVideoPlayer.autoplay = false;
  mainVideoPlayer.pause();
  const youtubeIframe = document.getElementById('youtubeTrailerIframe');
  if (youtubeIframe) {
    youtubeIframe.src = '';
    youtubeIframe.style.display = 'none';
  }
  if (progressSaveInterval) clearInterval(progressSaveInterval);
};

if (closePlayerModal) closePlayerModal.addEventListener('click', closePlayerFn);
const closePlayerModalBtn = document.getElementById('closePlayerModalBtn');
if (closePlayerModalBtn) closePlayerModalBtn.addEventListener('click', closePlayerFn);

const btnModalNavHome = document.getElementById('btnModalNavHome');
if (btnModalNavHome) btnModalNavHome.addEventListener('click', closePlayerFn);

const bcHome = document.getElementById('bcHome');
if (bcHome) bcHome.addEventListener('click', closePlayerFn);

const modalNavTabs = document.querySelectorAll('.btn-modal-nav-tab');
modalNavTabs.forEach(btn => {
  btn.addEventListener('click', () => {
    const tabName = btn.getAttribute('data-tab');
    closePlayerFn();
    const mainTabBtn = document.querySelector(`.nav-link[data-tab="${tabName}"]`);
    if (mainTabBtn) mainTabBtn.click();
  });
});

// TOGGLE FAVORITE
async function toggleFavorite(id) {
  const movie = moviesData.find(m => m.id === id);
  if (!movie) return;
  movie.isFavorite = !movie.isFavorite;
  await updateMovieOnServer(id, { isFavorite: movie.isFavorite });
  fetchMovies();
}

// SERVER UPDATE HELPER
async function updateMovieOnServer(id, data) {
  try {
    await fetch(`/api/movies/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  } catch (err) {
    console.error('Error updating movie:', err);
  }
}

// AUTOMATIC MOVIE METADATA AUTO-FILL FROM INTERNET
const btnFetchMeta = document.getElementById('btnFetchMeta');
const uploadTitleInput = document.getElementById('uploadTitle');
const fetchStatusText = document.getElementById('fetchStatusText');
const movieSearchSuggestions = document.getElementById('movieSearchSuggestions');

const onlineSearchModal = document.getElementById('onlineSearchModal');
const closeOnlineSearchModal = document.getElementById('closeOnlineSearchModal');
const modalSearchQuery = document.getElementById('modalSearchQuery');
const btnModalDoSearch = document.getElementById('btnModalDoSearch');
const modalSearchResults = document.getElementById('modalSearchResults');

async function fetchMovieMetadata(queryTitle, imdbId = null) {
  if (!queryTitle && !imdbId) return;

  if (fetchStatusText) {
    fetchStatusText.style.display = 'block';
    fetchStatusText.className = 'fetch-status-text loading';
    fetchStatusText.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Searching internet for movie info...';
  }

  try {
    const url = imdbId 
      ? `/api/fetch-metadata?imdbId=${encodeURIComponent(imdbId)}`
      : `/api/fetch-metadata?title=${encodeURIComponent(queryTitle)}`;
    
    const res = await fetch(url);
    const data = await res.json();

    if (data.success) {
      const realTitle = data.title || queryTitle;
      const formattedTitleWithYear = (data.year && !realTitle.includes(data.year)) 
        ? `${realTitle} (${data.year})` 
        : realTitle;

      if (document.getElementById('uploadTitle')) document.getElementById('uploadTitle').value = formattedTitleWithYear;
      if (document.getElementById('uploadSinhalaTitle')) document.getElementById('uploadSinhalaTitle').value = `${realTitle} (Sinhala Subtitles)`;
      if (document.getElementById('uploadYear')) document.getElementById('uploadYear').value = data.year || 2024;
      if (document.getElementById('uploadGenre')) document.getElementById('uploadGenre').value = data.genre || 'Action, Drama';
      if (document.getElementById('uploadDuration')) document.getElementById('uploadDuration').value = `${data.duration || '120 min'} | 2.1 GB`;
      if (document.getElementById('uploadDirector')) document.getElementById('uploadDirector').value = data.director || 'Unknown';
      if (document.getElementById('uploadCast')) document.getElementById('uploadCast').value = data.cast || 'Popular Cast';
      if (document.getElementById('uploadImdb')) document.getElementById('uploadImdb').value = data.imdbRating || 8.5;
      if (document.getElementById('uploadPersonalRating')) document.getElementById('uploadPersonalRating').value = data.imdbRating || 8.5;
      if (document.getElementById('uploadPosterUrl') && data.posterUrl) document.getElementById('uploadPosterUrl').value = data.posterUrl;
      if (document.getElementById('uploadNotes')) document.getElementById('uploadNotes').value = data.notes || '';
      if (document.getElementById('uploadLanguage') && data.language) document.getElementById('uploadLanguage').value = data.language;
      if (document.getElementById('uploadType') && data.type) document.getElementById('uploadType').value = data.type;

      if (fetchStatusText) {
        fetchStatusText.className = 'fetch-status-text success';
        fetchStatusText.innerHTML = `<i class="fa-solid fa-circle-check"></i> Updated official title to "${formattedTitleWithYear}" from internet!`;
      }
    } else {
      if (fetchStatusText) {
        fetchStatusText.className = 'fetch-status-text error';
        fetchStatusText.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Could not find details online. You can enter manually.';
      }
    }
  } catch (err) {
    console.error('Fetch metadata error:', err);
    if (fetchStatusText) {
      fetchStatusText.className = 'fetch-status-text error';
      fetchStatusText.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Search request failed.';
    }
  }
}

// LIVE AUTOCOMPLETE SUGGESTIONS DROPDOWN
let searchDebounce = null;
if (uploadTitleInput) {
  uploadTitleInput.addEventListener('input', () => {
    if (searchDebounce) clearTimeout(searchDebounce);
    const q = uploadTitleInput.value.trim();

    if (q.length < 2) {
      if (movieSearchSuggestions) movieSearchSuggestions.style.display = 'none';
      return;
    }

    searchDebounce = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search-movies?q=${encodeURIComponent(q)}`);
        const data = await res.json();

        if (data.success && data.results && data.results.length > 0) {
          renderSuggestionsDropdown(data.results);
        } else {
          if (movieSearchSuggestions) movieSearchSuggestions.style.display = 'none';
        }
      } catch (e) {
        console.error('Live search error:', e);
      }
    }, 300);
  });
}

function renderSuggestionsDropdown(results) {
  if (!movieSearchSuggestions) return;

  movieSearchSuggestions.innerHTML = results.map(m => `
    <div class="suggestion-item" data-title="${encodeURIComponent(m.title)}" data-imdb="${m.imdbId || ''}">
      <img src="${m.posterUrl || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=120&auto=format&fit=crop'}" class="suggestion-poster" alt="Poster">
      <div class="suggestion-info">
        <div class="suggestion-title">${m.title}</div>
        <div class="suggestion-meta">
          <span><i class="fa-solid fa-calendar"></i> ${m.year}</span>
          <span><i class="fa-solid fa-film"></i> ${m.type === 'tv' ? 'TV Series' : 'Movie'}</span>
          <span class="suggestion-source">${m.source || 'Online'}</span>
        </div>
      </div>
    </div>
  `).join('');

  movieSearchSuggestions.style.display = 'block';

  movieSearchSuggestions.querySelectorAll('.suggestion-item').forEach(el => {
    el.onclick = () => {
      const rawTitle = decodeURIComponent(el.getAttribute('data-title'));
      const imdbId = el.getAttribute('data-imdb');
      uploadTitleInput.value = rawTitle;
      movieSearchSuggestions.style.display = 'none';
      fetchMovieMetadata(rawTitle, imdbId);
    };
  });
}

document.addEventListener('click', (e) => {
  if (movieSearchSuggestions && !e.target.closest('.input-with-search-container')) {
    movieSearchSuggestions.style.display = 'none';
  }
});

// ONLINE SEARCH MODAL LOGIC
if (btnFetchMeta) {
  btnFetchMeta.onclick = () => {
    const currentTitle = uploadTitleInput ? uploadTitleInput.value.trim() : '';
    if (onlineSearchModal) {
      onlineSearchModal.classList.add('active');
      if (modalSearchQuery) {
        modalSearchQuery.value = currentTitle;
        modalSearchQuery.focus();
        if (currentTitle.length >= 2) {
          performModalOnlineSearch(currentTitle);
        }
      }
    }
  };
}

if (closeOnlineSearchModal) {
  closeOnlineSearchModal.onclick = () => {
    if (onlineSearchModal) onlineSearchModal.classList.remove('active');
  };
}

if (btnModalDoSearch) {
  btnModalDoSearch.onclick = () => {
    const q = modalSearchQuery ? modalSearchQuery.value.trim() : '';
    if (q) performModalOnlineSearch(q);
  };
}

if (modalSearchQuery) {
  modalSearchQuery.onkeyup = (e) => {
    if (e.key === 'Enter') {
      const q = modalSearchQuery.value.trim();
      if (q) performModalOnlineSearch(q);
    }
  };
}

async function performModalOnlineSearch(query) {
  if (!modalSearchResults) return;

  modalSearchResults.innerHTML = `
    <div class="search-empty-state">
      <i class="fa-solid fa-spinner fa-spin" style="font-size: 2.5rem; color: var(--accent-crimson); margin-bottom: 10px;"></i>
      <p style="color: #ffffff; font-weight: 600;">Searching Google / OMDb online for "${query}"...</p>
    </div>
  `;

  try {
    const res = await fetch(`/api/search-movies?q=${encodeURIComponent(query)}`);
    const data = await res.json();

    if (data.success && data.results && data.results.length > 0) {
      modalSearchResults.innerHTML = data.results.map(m => `
        <div class="online-search-card" data-title="${encodeURIComponent(m.title)}" data-imdb="${m.imdbId || ''}">
          <img src="${m.posterUrl || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=200&auto=format&fit=crop'}" class="online-search-poster" alt="Poster">
          <div class="online-search-body">
            <div class="online-search-title">${m.title}</div>
            <div class="online-search-sub">
              <span>📅 ${m.year}</span>
              <span>🎬 ${m.type === 'tv' ? 'TV Show' : 'Movie'}</span>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" style="margin-top: 8px; font-size: 0.75rem; width: 100%;">
              <i class="fa-solid fa-check text-crimson"></i> Select Movie
            </button>
          </div>
        </div>
      `).join('');

      modalSearchResults.querySelectorAll('.online-search-card').forEach(card => {
        card.onclick = () => {
          const rawTitle = decodeURIComponent(card.getAttribute('data-title'));
          const imdbId = card.getAttribute('data-imdb');
          if (uploadTitleInput) uploadTitleInput.value = rawTitle;
          if (onlineSearchModal) onlineSearchModal.classList.remove('active');
          fetchMovieMetadata(rawTitle, imdbId);
        };
      });
    } else {
      modalSearchResults.innerHTML = `
        <div class="search-empty-state">
          <i class="fa-solid fa-face-frown" style="font-size: 2.5rem; color: rgba(255,255,255,0.3); margin-bottom: 10px;"></i>
          <p style="color: var(--text-muted);">No online movies found matching "${query}". Try another title.</p>
        </div>
      `;
    }
  } catch (err) {
    console.error('Modal search error:', err);
    modalSearchResults.innerHTML = `
      <div class="search-empty-state">
        <i class="fa-solid fa-triangle-exclamation" style="font-size: 2.5rem; color: var(--color-danger); margin-bottom: 10px;"></i>
        <p style="color: var(--color-danger);">Failed to search online. Please check internet connection.</p>
      </div>
    `;
  }
}

function cleanMovieTitleSmartFrontend(rawTitle) {
  if (!rawTitle) return '';
  let str = rawTitle
    .replace(/\.[^/.]+$/, '')
    .replace(/[\._\-]/g, ' ');

  str = str.replace(/baiscopedownloads\s*\.link|baiscopedownloads|baiscope\s*\.lk|baiscope|sinhalasub\s*\.lk|sinhalasub|cinesubz\s*\.co|cinesubz|yts\s*\.mx|yts\s*\.lt|yts|yify|rarbg|ettv|eztv|tgx|psa|fgt|sparks|galaxyrg|utr|ion10|pahe|1337x|torrent|link/gi, ' ');
  str = str.replace(/\(.*?\)|\[.*?\]|\{.*?\}/g, ' ');

  str = str.replace(/\b(19\d\d|20[0-3]\d)\b/g, ' ');
  str = str.replace(/\b(english|hindi|tamil|telugu|sinhala|malayalam|kannada|marathi|bengali|punjabi|gujarati|bhojpuri|urdu|korean|japanese|chinese|spanish|french|german|russian|italian|portuguese|arabic|turkish)\b/gi, ' ');
  str = str.replace(/\b(1080p|720p|480p|360p|2160p|4k|uhd|hdr|hdr10|bluray|blu-ray|webdl|web-dl|web|webrip|hdtvrip|hdtv|hdrip|dvdrip|dvd|brrip|bdrip|vhs|cam|hdcam|hdts|tc|hc|clean|line|mic|x264|x265|h264|h265|hevc|aac|ac3|dts|dd5\.1|dd7\.1|5\.1|7\.1|ch|xvid|divx|dl|unrated|uncut|extended|edition|proper|repack|remux|dsnp|nf|amzn|hmax|v2|v1|multi|dual|audio|dubbed|subbed|sub|esub|esubs|hq|lq|800mb|700mb|900mb|650mb|500mb|1gb|2gb)\b/gi, ' ');

  return str.replace(/\s+/g, ' ').trim() || rawTitle.replace(/\.[^/.]+$/, '').replace(/[\._\-]/g, ' ').trim();
}

// UNIFIED UPLOAD DROPZONE LOGIC (VIDEO + SUBTITLE ALL-IN-ONE)
const btnSelectVideoFile = document.getElementById('btnSelectVideoFile');
const btnSelectSubFile = document.getElementById('btnSelectSubFile');
const subFileName = document.getElementById('subFileName');

if (btnSelectVideoFile) {
  btnSelectVideoFile.addEventListener('click', (e) => {
    e.stopPropagation();
    videoFileInput.click();
  });
}

if (btnSelectSubFile) {
  btnSelectSubFile.addEventListener('click', (e) => {
    e.stopPropagation();
    subtitleFileInput.click();
  });
}

dropzoneVideo.addEventListener('click', (e) => {
  if (e.target !== btnSelectSubFile && !e.target.closest('#btnSelectSubFile')) {
    videoFileInput.click();
  }
});

btnSelectPoster.addEventListener('click', () => posterFileInput.click());

function handleSelectedVideoAndSubFiles(files) {
  if (!files || files.length === 0) return;
  const fileArray = Array.from(files);

  let foundVideo = null;
  let foundSub = null;

  fileArray.forEach(file => {
    const ext = file.name.split('.').pop().toLowerCase();
    if (['srt', 'vtt', 'ass'].includes(ext)) {
      foundSub = file;
    } else if (file.type.startsWith('video/') || ['mp4', 'mkv', 'webm', 'avi', 'mov', 'flv'].includes(ext)) {
      foundVideo = file;
    }
  });

  if (foundVideo) {
    const dtVid = new DataTransfer();
    dtVid.items.add(foundVideo);
    videoFileInput.files = dtVid.files;

    videoFileName.innerHTML = `<i class="fa-solid fa-film"></i> Video: ${foundVideo.name} (${(foundVideo.size / (1024*1024)).toFixed(1)} MB)`;
    const cleanedTitle = cleanMovieTitleSmartFrontend(foundVideo.name);
    if (cleanedTitle && uploadTitleInput) {
      uploadTitleInput.value = cleanedTitle;
      fetchMovieMetadata(cleanedTitle);
    }
  }

  if (foundSub) {
    const dtSub = new DataTransfer();
    dtSub.items.add(foundSub);
    subtitleFileInput.files = dtSub.files;

    if (subFileName) {
      subFileName.innerHTML = `<i class="fa-solid fa-closed-captioning"></i> Subtitle: ${foundSub.name}`;
      subFileName.style.background = 'rgba(40,167,69,0.15)';
      subFileName.style.color = '#28a745';
      subFileName.style.borderColor = 'rgba(40,167,69,0.4)';
    }
  }
}

videoFileInput.addEventListener('change', () => {
  handleSelectedVideoAndSubFiles(videoFileInput.files);
});

subtitleFileInput.addEventListener('change', () => {
  if (subtitleFileInput.files.length > 0) {
    const file = subtitleFileInput.files[0];
    if (subFileName) {
      subFileName.innerHTML = `<i class="fa-solid fa-closed-captioning"></i> Subtitle: ${file.name}`;
      subFileName.style.background = 'rgba(40,167,69,0.15)';
      subFileName.style.color = '#28a745';
      subFileName.style.borderColor = 'rgba(40,167,69,0.4)';
    }
  }
});

// FULL DRAG & DROP FOR ALL-IN-ONE DROPZONE (VIDEO + SUBTITLE)
dropzoneVideo.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzoneVideo.classList.add('drag-over');
});

dropzoneVideo.addEventListener('dragleave', () => {
  dropzoneVideo.classList.remove('drag-over');
});

dropzoneVideo.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzoneVideo.classList.remove('drag-over');

  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    handleSelectedVideoAndSubFiles(e.dataTransfer.files);
  }
});

uploadForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const formData = new FormData();
  if (videoFileInput.files[0]) formData.append('video', videoFileInput.files[0]);
  if (posterFileInput.files[0]) formData.append('poster', posterFileInput.files[0]);
  if (subtitleFileInput.files[0]) formData.append('subtitle', subtitleFileInput.files[0]);

  formData.append('title', document.getElementById('uploadTitle').value);
  formData.append('sinhalaTitle', document.getElementById('uploadSinhalaTitle') ? document.getElementById('uploadSinhalaTitle').value : '');
  formData.append('year', document.getElementById('uploadYear').value);
  formData.append('quality', document.getElementById('uploadQuality').value);
  formData.append('hasSinhalaSub', 'true');
  formData.append('genre', document.getElementById('uploadGenre').value);
  formData.append('duration', document.getElementById('uploadDuration').value);
  formData.append('director', document.getElementById('uploadDirector').value);
  formData.append('cast', document.getElementById('uploadCast').value);
  formData.append('imdbRating', document.getElementById('uploadImdb').value);
  formData.append('personalRating', document.getElementById('uploadPersonalRating').value);
  formData.append('posterUrl', document.getElementById('uploadPosterUrl').value);
  formData.append('notes', document.getElementById('uploadNotes') ? document.getElementById('uploadNotes').value : '');
  formData.append('language', document.getElementById('uploadLanguage') ? document.getElementById('uploadLanguage').value : 'English');
  formData.append('type', document.getElementById('uploadType') ? document.getElementById('uploadType').value : 'movie');

  uploadProgressContainer.style.display = 'block';
  uploadProgressBar.style.width = '0%';
  if (uploadTrackIndicator) uploadTrackIndicator.style.width = '0%';
  uploadPercentage.textContent = '0%';
  uploadStatusText.innerHTML = '<i class="fa-solid fa-cloud-arrow-up fa-fade"></i> Starting upload...';

  const globalUploadBadge = document.getElementById('globalUploadBadge');
  const globalUploadTitle = document.getElementById('globalUploadTitle');
  const globalUploadPct = document.getElementById('globalUploadPct');
  const globalUploadBar = document.getElementById('globalUploadBar');

  const navUploadProgress = document.getElementById('navUploadProgress');
  const navUploadText = document.getElementById('navUploadText');

  const movieTitleVal = document.getElementById('uploadTitle').value || 'Movie File';
  if (globalUploadBadge) {
    globalUploadBadge.style.display = 'block';
    if (globalUploadTitle) globalUploadTitle.textContent = `Uploading ${movieTitleVal}...`;
    if (globalUploadPct) globalUploadPct.textContent = '0%';
    if (globalUploadBar) globalUploadBar.style.width = '0%';
  }

  if (navUploadProgress) {
    navUploadProgress.style.display = 'flex';
    if (navUploadText) navUploadText.textContent = `Uploading 0%`;
  }

  window.isUploadingActive = true;
  const uploadStartTime = Date.now();

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/movies', true);

  xhr.upload.onprogress = (event) => {
    if (event.lengthComputable && event.total > 0) {
      const pct = Math.min(99, Math.round((event.loaded / event.total) * 100));
      const loadedMB = (event.loaded / (1024 * 1024)).toFixed(1);
      const totalMB = (event.total / (1024 * 1024)).toFixed(1);

      const elapsedSec = (Date.now() - uploadStartTime) / 1000;
      let speedText = '';
      if (elapsedSec > 0.4 && event.loaded > 0) {
        const speedMBps = ((event.loaded / (1024 * 1024)) / elapsedSec).toFixed(1);
        speedText = ` • ${speedMBps} MB/s`;
      }

      uploadProgressBar.style.width = `${pct}%`;
      if (uploadTrackIndicator) uploadTrackIndicator.style.width = `${pct}%`;
      uploadPercentage.textContent = `${pct}%`;
      uploadStatusText.innerHTML = `<i class="fa-solid fa-cloud-arrow-up fa-fade"></i> Uploading: ${loadedMB} MB / ${totalMB} MB${speedText}`;

      if (globalUploadPct) globalUploadPct.textContent = `${pct}%`;
      if (globalUploadBar) globalUploadBar.style.width = `${pct}%`;
      if (navUploadText) navUploadText.textContent = `Uploading ${pct}%`;
    }
  };

  xhr.onload = () => {
    clearInterval(tgTimer);
    window.isUploadingActive = false;
    if (globalUploadBadge) globalUploadBadge.style.display = 'none';
    if (navUploadProgress) navUploadProgress.style.display = 'none';

    if (xhr.status === 201 || xhr.status === 200) {
      uploadProgressBar.style.width = '100%';
      if (uploadTrackIndicator) uploadTrackIndicator.style.width = '100%';
      uploadPercentage.textContent = '100%';
      uploadStatusText.innerHTML = '<i class="fa-solid fa-circle-check text-success"></i> Upload complete!';
      setTimeout(() => {
        uploadProgressContainer.style.display = 'none';
        uploadModal.classList.remove('active');
        uploadForm.reset();
        videoFileName.textContent = 'No video file selected';
        fetchMovies();
        alert('🎬 Movie and Subtitles added to your private collection!');
      }, 700);
    } else {
      alert('Failed to upload movie. Please try again.');
    }
  };

  xhr.onerror = () => {
    clearInterval(tgTimer);
    window.isUploadingActive = false;
    if (globalUploadBadge) globalUploadBadge.style.display = 'none';
    if (navUploadProgress) navUploadProgress.style.display = 'none';
    alert('Network error during upload. Please try again.');
  };

  // After the browser finishes sending, the server uploads the file to Telegram: poll that progress.
  const uploadId = 'up-' + Date.now();
  formData.append('uploadId', uploadId);
  let tgTimer = null;
  xhr.upload.onload = () => {
    uploadProgressBar.style.width = '100%';
    if (uploadTrackIndicator) uploadTrackIndicator.style.width = '100%';
    uploadPercentage.textContent = '100%';
    uploadStatusText.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Finalizing movie stream & subtitles...';

    tgTimer = setInterval(async () => {
      try {
        const res = await fetch(`/api/upload-progress/${uploadId}`);
        if (!res.ok) return;
        const r = await res.json();
        if (r && r.stage === 'telegram') {
          const tPct = r.pct || 0;
          uploadProgressBar.style.width = `${tPct}%`;
          if (uploadTrackIndicator) uploadTrackIndicator.style.width = `${tPct}%`;
          uploadPercentage.textContent = `${tPct}%`;
          uploadStatusText.innerHTML = `<i class="fa-brands fa-telegram fa-beat"></i> Syncing to Telegram Cloud Storage... ${tPct}%`;
          if (globalUploadTitle) globalUploadTitle.textContent = `${movieTitleVal}: Telegram ${tPct}%`;
          if (globalUploadPct) globalUploadPct.textContent = `${tPct}%`;
          if (globalUploadBar) globalUploadBar.style.width = `${tPct}%`;
          if (navUploadText) navUploadText.textContent = `Telegram ${tPct}%`;
        } else if (r && r.stage === 'done') {
          uploadProgressBar.style.width = '100%';
          if (uploadTrackIndicator) uploadTrackIndicator.style.width = '100%';
          uploadPercentage.textContent = '100%';
          uploadStatusText.innerHTML = '<i class="fa-solid fa-circle-check text-success"></i> Upload complete!';
        }
      } catch (e) {}
    }, 800);
  };

  xhr.send(formData);
});

window.addEventListener('beforeunload', (e) => {
  if (window.isUploadingActive) {
    e.preventDefault();
    e.returnValue = 'Movie upload in progress. Reloading/leaving this page will cancel the active upload.';
  }
});

// BULK MULTI-MOVIE UPLOAD MANAGEMENT
let bulkStagedMovies = [];

const tabModeSingle = document.getElementById('tabModeSingle');
const tabModeBulk = document.getElementById('tabModeBulk');
const uploadFormEl = document.getElementById('uploadForm');
const bulkUploadContainer = document.getElementById('bulkUploadContainer');

const dropzoneBulkVideo = document.getElementById('dropzoneBulkVideo');
const bulkVideoInput = document.getElementById('bulkVideoInput');
const btnBrowseBulk = document.getElementById('btnBrowseBulk');
const bulkQueueSection = document.getElementById('bulkQueueSection');
const bulkQueueList = document.getElementById('bulkQueueList');
const bulkQueueCount = document.getElementById('bulkQueueCount');
const btnClearBulkQueue = document.getElementById('btnClearBulkQueue');
const btnStartBulkUpload = document.getElementById('btnStartBulkUpload');
const bulkProgressContainer = document.getElementById('bulkProgressContainer');
const bulkProgressBar = document.getElementById('bulkProgressBar');
const bulkStatusText = document.getElementById('bulkStatusText');
const bulkPercentage = document.getElementById('bulkPercentage');

if (tabModeSingle && tabModeBulk) {
  tabModeSingle.onclick = () => {
    tabModeSingle.classList.add('active');
    tabModeBulk.classList.remove('active');
    if (tabModeTvFolder) tabModeTvFolder.classList.remove('active');
    uploadFormEl.style.display = 'flex';
    bulkUploadContainer.style.display = 'none';
    const tvFolderContainer = document.getElementById('tvFolderContainer');
    if (tvFolderContainer) tvFolderContainer.style.display = 'none';
  };
  tabModeBulk.onclick = () => {
    tabModeBulk.classList.add('active');
    tabModeSingle.classList.remove('active');
    if (tabModeTvFolder) tabModeTvFolder.classList.remove('active');
    uploadFormEl.style.display = 'none';
    bulkUploadContainer.style.display = 'block';
    const tvFolderContainer = document.getElementById('tvFolderContainer');
    if (tvFolderContainer) tvFolderContainer.style.display = 'none';
  };
}

const tabModeTvFolder = document.getElementById('tabModeTvFolder');
const tvFolderContainer = document.getElementById('tvFolderContainer');
const dropzoneTvFolder = document.getElementById('dropzoneTvFolder');
const tvFolderInput = document.getElementById('tvFolderInput');
const btnBrowseTvFolder = document.getElementById('btnBrowseTvFolder');
const tvFolderStagingSection = document.getElementById('tvFolderStagingSection');
const tvShowStagedTitle = document.getElementById('tvShowStagedTitle');
const tvStagedSummary = document.getElementById('tvStagedSummary');
const tvStagedSeasonsList = document.getElementById('tvStagedSeasonsList');
const btnSaveTvShowFolder = document.getElementById('btnSaveTvShowFolder');

let stagedTvShowObj = null;

if (tabModeTvFolder) {
  tabModeTvFolder.onclick = () => {
    tabModeTvFolder.classList.add('active');
    if (tabModeSingle) tabModeSingle.classList.remove('active');
    if (tabModeBulk) tabModeBulk.classList.remove('active');
    uploadFormEl.style.display = 'none';
    bulkUploadContainer.style.display = 'none';
    if (tvFolderContainer) tvFolderContainer.style.display = 'block';
  };
}

if (dropzoneTvFolder && tvFolderInput) {
  dropzoneTvFolder.onclick = (e) => {
    if (e.target !== btnBrowseTvFolder && e.target.closest('#btnBrowseTvFolder')) return;
    tvFolderInput.click();
  };
}
if (btnBrowseTvFolder && tvFolderInput) {
  btnBrowseTvFolder.onclick = (e) => {
    e.stopPropagation();
    tvFolderInput.click();
  };
}

if (tvFolderInput) {
  tvFolderInput.addEventListener('change', async () => {
    if (tvFolderInput.files.length === 0) return;

    const filesArray = Array.from(tvFolderInput.files).filter(f => f.type.startsWith('video/') || /\.(mp4|mkv|webm|avi)$/i.test(f.name));
    if (filesArray.length === 0) {
      alert('No video files found inside selected folder.');
      return;
    }

    const firstRelPath = filesArray[0].webkitRelativePath || filesArray[0].name;
    const pathParts = firstRelPath.split('/');
    const rootFolderTitle = pathParts[0] || 'My TV Show';

    let cleanShowTitle = rootFolderTitle
      .replace(/[\._\-]/g, " ")
      .replace(/\b(1080p|720p|4k|uhd|bluray|webdl|web-dl|x264|x265|hevc|aac|dvdrip|brrip)\b/gi, "")
      .replace(/\(.*?\)|\[.*?\]/g, "")
      .trim();

    const seasonsMap = {};

    filesArray.forEach((file) => {
      const relPath = file.webkitRelativePath || file.name;
      const parts = relPath.split('/');
      let seasonName = "Season 1";
      let seasonNum = 1;

      parts.forEach(part => {
        const sMatch = part.match(/season\s*(\d+)|s(\d+)/i);
        if (sMatch) {
          seasonNum = parseInt(sMatch[1] || sMatch[2]) || 1;
          seasonName = `Season ${seasonNum}`;
        }
      });

      if (!seasonsMap[seasonName]) {
        seasonsMap[seasonName] = {
          seasonNumber: seasonNum,
          title: seasonName,
          episodes: []
        };
      }

      const epCleanTitle = file.name
        .replace(/\.[^/.]+$/, "")
        .replace(/[\._\-]/g, " ")
        .replace(/\b(1080p|720p|4k|uhd|x264|x265|hevc)\b/gi, "")
        .trim();

      seasonsMap[seasonName].episodes.push({
        episodeNumber: seasonsMap[seasonName].episodes.length + 1,
        title: epCleanTitle || `Episode ${seasonsMap[seasonName].episodes.length + 1}`,
        duration: "45 min",
        videoFile: file,
        videoUrl: ""
      });
    });

    const seasonsArray = Object.values(seasonsMap);
    let totalEpisodes = 0;
    seasonsArray.forEach(s => totalEpisodes += s.episodes.length);

    stagedTvShowObj = {
      title: cleanShowTitle,
      type: "tv",
      language: "English",
      year: new Date().getFullYear(),
      seasons: seasonsArray
    };

    if (tvShowStagedTitle) tvShowStagedTitle.textContent = cleanShowTitle;
    if (tvStagedSummary) tvStagedSummary.textContent = `${seasonsArray.length} Seasons | ${totalEpisodes} Episodes`;
    if (tvFolderStagingSection) tvFolderStagingSection.style.display = 'block';

    if (tvStagedSeasonsList) {
      tvStagedSeasonsList.innerHTML = seasonsArray.map(s => `
        <div class="bulk-item-card" style="margin-bottom: 10px;">
          <div class="bulk-item-title"><i class="fa-solid fa-folder-open text-warning"></i> ${s.title} (${s.episodes.length} Episodes)</div>
          <div class="bulk-item-meta">
            ${s.episodes.slice(0, 4).map(e => `<span>E${e.episodeNumber}: ${e.title}</span>`).join(' • ')}
            ${s.episodes.length > 4 ? `<span>...and ${s.episodes.length - 4} more</span>` : ''}
          </div>
        </div>
      `).join('');
    }

    try {
      const res = await fetch(`/api/fetch-metadata?title=${encodeURIComponent(cleanShowTitle)}`);
      const data = await res.json();
      if (data.success) {
        stagedTvShowObj.posterUrl = data.posterUrl;
        stagedTvShowObj.genre = data.genre;
        stagedTvShowObj.notes = data.notes;
        stagedTvShowObj.imdbRating = data.imdbRating;
        stagedTvShowObj.imdbId = data.imdbId;
      }
    } catch(e) {}
  });
}

if (btnSaveTvShowFolder) {
  btnSaveTvShowFolder.onclick = async () => {
    if (!stagedTvShowObj) return;

    const tvFolderProgressContainer = document.getElementById('tvFolderProgressContainer');
    const tvFolderProgressBar = document.getElementById('tvFolderProgressBar');
    const tvFolderStatusText = document.getElementById('tvFolderStatusText');
    const tvFolderPercentage = document.getElementById('tvFolderPercentage');

    if (tvFolderProgressContainer) tvFolderProgressContainer.style.display = 'block';

    // Collect all episode video files across all seasons
    const uploadTasks = [];
    stagedTvShowObj.seasons.forEach((season) => {
      season.episodes.forEach((ep) => {
        if (ep.videoFile) {
          uploadTasks.push({ season, ep });
        }
      });
    });

    const totalCount = uploadTasks.length;

    for (let i = 0; i < totalCount; i++) {
      const { season, ep } = uploadTasks[i];
      if (tvFolderStatusText) {
        tvFolderStatusText.textContent = `Uploading ${season.title} - ${ep.title} (${i + 1}/${totalCount})...`;
      }

      try {
        const formData = new FormData();
        formData.append('video', ep.videoFile);

        const uploadPromise = new Promise((resolve) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/api/upload-video-single', true);

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const filePct = (event.loaded / event.total);
              const overallPct = Math.round(((i + filePct) / totalCount) * 100);
              if (tvFolderProgressBar) tvFolderProgressBar.style.width = `${overallPct}%`;
              if (tvFolderPercentage) tvFolderPercentage.textContent = `${overallPct}%`;
            }
          };

          xhr.onload = () => {
            if (xhr.status === 200) {
              try {
                const res = JSON.parse(xhr.responseText);
                resolve(res.videoUrl || res.localPath || '');
              } catch(e) { resolve(''); }
            } else {
              resolve('');
            }
          };
          xhr.onerror = () => resolve('');
          xhr.send(formData);
        });

        const uploadedUrl = await uploadPromise;
        ep.videoUrl = uploadedUrl || ep.videoUrl || '';
        delete ep.videoFile;
      } catch (err) {
        console.error('Episode upload error:', err);
      }
    }

    if (stagedTvShowObj.seasons[0] && stagedTvShowObj.seasons[0].episodes[0]) {
      stagedTvShowObj.videoUrl = stagedTvShowObj.seasons[0].episodes[0].videoUrl || '';
    }

    if (tvFolderStatusText) tvFolderStatusText.textContent = 'Saving TV Series details...';

    try {
      await fetch('/api/movies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stagedTvShowObj)
      });

      alert(`📺 TV Series "${stagedTvShowObj.title}" (${totalCount} Episodes) uploaded & saved successfully!`);
      uploadModal.classList.remove('active');
      if (tvFolderProgressContainer) tvFolderProgressContainer.style.display = 'none';
      fetchMovies();
    } catch (err) {
      alert('Failed to save TV series folder.');
    }
  };
}

if (dropzoneBulkVideo && bulkVideoInput) {
  dropzoneBulkVideo.onclick = (e) => {
    if (e.target !== btnBrowseBulk && e.target.closest('#btnBrowseBulk')) return;
    bulkVideoInput.click();
  };
}
if (btnBrowseBulk && bulkVideoInput) {
  btnBrowseBulk.onclick = (e) => {
    e.stopPropagation();
    bulkVideoInput.click();
  };
}

if (bulkVideoInput) {
  bulkVideoInput.addEventListener('change', async () => {
    if (bulkVideoInput.files.length === 0) return;

    const filesArray = Array.from(bulkVideoInput.files);
    for (const file of filesArray) {
      const cleanTitle = file.name
        .replace(/\.[^/.]+$/, "")
        .replace(/[\._\-]/g, " ")
        .replace(/\b(1080p|720p|4k|uhd|bluray|webdl|web-dl|x264|x265|hevc|aac|dvdrip|brrip)\b/gi, "")
        .replace(/\(.*?\)|\[.*?\]/g, "")
        .trim();

      const item = {
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        file: file,
        title: cleanTitle || file.name,
        metadata: null,
        status: 'queued'
      };
      bulkStagedMovies.push(item);
    }

    renderBulkQueue();
    bulkVideoInput.value = '';

    // Asynchronously fetch metadata for each queued movie
    for (const item of bulkStagedMovies) {
      if (!item.metadata) {
        try {
          const res = await fetch(`/api/fetch-metadata?title=${encodeURIComponent(item.title)}`);
          const data = await res.json();
          if (data.success) {
            item.metadata = data;
            item.title = data.title || item.title;
          }
        } catch (e) {
          console.error('Error fetching bulk item meta:', e);
        }
        renderBulkQueue();
      }
    }
  });
}

function renderBulkQueue() {
  if (!bulkQueueSection || !bulkQueueList) return;

  if (bulkStagedMovies.length === 0) {
    bulkQueueSection.style.display = 'none';
    return;
  }

  bulkQueueSection.style.display = 'block';
  if (bulkQueueCount) bulkQueueCount.textContent = bulkStagedMovies.length;

  bulkQueueList.innerHTML = bulkStagedMovies.map((item) => {
    const meta = item.metadata || {};
    const poster = meta.posterUrl || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=120&auto=format&fit=crop';
    const year = meta.year || '2024';
    const genre = meta.genre || 'Action';
    const rating = meta.imdbRating ? `⭐ IMDb ${meta.imdbRating}` : '';
    const sizeStr = `${(item.file.size / (1024*1024)).toFixed(1)} MB`;

    return `
      <div class="bulk-item-card" id="bulkItem_${item.id}">
        <img src="${poster}" class="bulk-item-thumb" alt="Poster">
        <div class="bulk-item-info">
          <input type="text" class="bulk-item-title-input" value="${item.title}" onchange="updateBulkItemTitle('${item.id}', this.value)">
          <div class="bulk-item-meta">
            <span>📅 ${year}</span>
            <span>🎭 ${genre}</span>
            <span>${rating}</span>
            <span>💾 ${sizeStr}</span>
          </div>
        </div>
        <div class="bulk-item-status ${item.status}">
          ${item.status === 'done' ? '<i class="fa-solid fa-circle-check"></i> Done' : 
            item.status === 'uploading' ? '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...' : 
            '<i class="fa-solid fa-clock"></i> Queued'}
        </div>
        <button type="button" class="btn-icon" style="width:28px; height:28px;" onclick="removeBulkItem('${item.id}')" title="Remove"><i class="fa-solid fa-xmark"></i></button>
      </div>
    `;
  }).join('');
}

window.updateBulkItemTitle = (id, newTitle) => {
  const item = bulkStagedMovies.find(i => i.id === id);
  if (item) item.title = newTitle;
};

window.removeBulkItem = (id) => {
  bulkStagedMovies = bulkStagedMovies.filter(i => i.id !== id);
  renderBulkQueue();
};

if (btnClearBulkQueue) {
  btnClearBulkQueue.onclick = () => {
    bulkStagedMovies = [];
    renderBulkQueue();
  };
}

// BATCH UPLOAD SEQUENTIAL EXECUTION
if (btnStartBulkUpload) {
  btnStartBulkUpload.onclick = async () => {
    if (bulkStagedMovies.length === 0) return;

    btnStartBulkUpload.disabled = true;
    if (bulkProgressContainer) bulkProgressContainer.style.display = 'block';

    const totalCount = bulkStagedMovies.length;
    let completedCount = 0;

    for (let i = 0; i < totalCount; i++) {
      const item = bulkStagedMovies[i];
      item.status = 'uploading';
      renderBulkQueue();

      const meta = item.metadata || {};
      const formData = new FormData();
      formData.append('video', item.file);
      formData.append('title', item.title);
      formData.append('sinhalaTitle', meta.sinhalaTitle || `${item.title} (Sinhala Subtitles)`);
      formData.append('year', meta.year || 2024);
      formData.append('quality', 'WEB-DL');
      formData.append('hasSinhalaSub', 'true');
      formData.append('genre', meta.genre || 'Action');
      formData.append('duration', meta.duration || '120 min');
      formData.append('director', meta.director || 'Popular Director');
      formData.append('cast', meta.cast || 'Popular Cast');
      formData.append('imdbRating', meta.imdbRating || 8.5);
      formData.append('personalRating', meta.imdbRating || 8.5);
      formData.append('posterUrl', meta.posterUrl || '');
      formData.append('notes', meta.notes || '');
      formData.append('language', meta.language || 'English');
      formData.append('type', meta.type || 'movie');

      if (bulkStatusText) bulkStatusText.textContent = `[${i + 1}/${totalCount}] Uploading ${item.title}...`;

      try {
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/api/movies', true);

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const filePct = Math.round((event.loaded / event.total) * 100);
              const overallPct = Math.round(((i + (filePct / 100)) / totalCount) * 100);
              if (bulkProgressBar) bulkProgressBar.style.width = `${overallPct}%`;
              if (bulkPercentage) bulkPercentage.textContent = `${overallPct}%`;
            }
          };

          const uploadId = 'up-' + Date.now() + '-' + i;
          formData.append('uploadId', uploadId);
          let tgTimer = null;
          xhr.upload.onload = () => {
            tgTimer = setInterval(async () => {
              try {
                const r = await (await fetch(`/api/upload-progress/${uploadId}`)).json();
                if (bulkStatusText) bulkStatusText.textContent = `[${i + 1}/${totalCount}] Sending ${item.title} to Telegram... ${r.pct}%`;
              } catch (e) {}
            }, 1000);
          };

          xhr.onload = () => {
            clearInterval(tgTimer);
            if (xhr.status === 200 || xhr.status === 201) resolve();
            else reject(new Error('Upload failed'));
          };
          xhr.onerror = () => { clearInterval(tgTimer); reject(new Error('Network error')); };
          xhr.send(formData);
        });

        item.status = 'done';
        completedCount++;
      } catch (err) {
        console.error(`Error uploading ${item.title}:`, err);
        item.status = 'queued';
      }
      renderBulkQueue();
    }

    if (bulkProgressBar) bulkProgressBar.style.width = '100%';
    if (bulkPercentage) bulkPercentage.textContent = '100%';
    if (bulkStatusText) bulkStatusText.textContent = `Batch upload complete! Successfully added ${completedCount} movies!`;

    alert(`🎉 Batch Upload Complete! ${completedCount} movies added to your private collection.`);
    bulkStagedMovies = [];
    if (bulkProgressContainer) bulkProgressContainer.style.display = 'none';
    btnStartBulkUpload.disabled = false;
    uploadModal.classList.remove('active');
    fetchMovies();
  };
}

btnUploadModal.addEventListener('click', () => uploadModal.classList.add('active'));
closeUploadModal.addEventListener('click', () => uploadModal.classList.remove('active'));

// NAVIGATE TO HOME
function navigateToHome() {
  // 1. Close player modal if open
  if (typeof closePlayerFn === 'function') {
    closePlayerFn();
  } else if (playerModal) {
    playerModal.classList.remove('active');
    if (mainVideoPlayer) mainVideoPlayer.pause();
  }

  // 2. Close edit modal or upload modal if open
  const editModal = document.getElementById('editMovieModal');
  if (editModal) editModal.classList.remove('active');
  if (uploadModal) uploadModal.classList.remove('active');

  // 3. Reset active tab to 'Home' (data-tab="all")
  activeTab = 'all';
  navLinks.forEach(link => {
    if (link.dataset.tab === 'all') {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // 4. Reset search input and filters
  if (searchInput) searchInput.value = '';
  if (clearSearch) clearSearch.style.display = 'none';
  if (genreFilter) genreFilter.value = 'all';
  if (qualityFilter) qualityFilter.value = 'all';
  if (sortFilter) sortFilter.value = 'latest';

  // 5. Scroll smoothly to top
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // 6. Refresh library movies
  fetchMovies();
}

// EVENT LISTENERS & NAVIGATION
function setupEventListeners() {
  // Brand Logo Click -> Navigate to Home
  const brandLogos = document.querySelectorAll('.brand-logo');
  brandLogos.forEach(logo => {
    if (!logo.closest('#authOverlay')) {
      logo.style.cursor = 'pointer';
      logo.addEventListener('click', navigateToHome);
    }
  });

  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      navLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      activeTab = link.dataset.tab;
      fetchMovies();
    });
  });

  searchInput.addEventListener('input', () => {
    clearSearch.style.display = searchInput.value ? 'block' : 'none';
    fetchMovies();
  });

  clearSearch.addEventListener('click', () => {
    searchInput.value = '';
    clearSearch.style.display = 'none';
    fetchMovies();
  });

  genreFilter.addEventListener('change', fetchMovies);
  qualityFilter.addEventListener('change', fetchMovies);
  sortFilter.addEventListener('change', fetchMovies);

  viewGridBtn.addEventListener('click', () => {
    viewMode = 'grid';
    viewGridBtn.classList.add('active');
    viewListBtn.classList.remove('active');
    renderMoviesGrid();
  });

  viewListBtn.addEventListener('click', () => {
    viewMode = 'list';
    viewListBtn.classList.add('active');
    viewGridBtn.classList.remove('active');
    renderMoviesGrid();
  });
}

function formatSeconds(secs) {
  const hrs = Math.floor(secs / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Background migration (migrate_to_telegram.js) progress, shown in the navbar upload pill
setInterval(async () => {
  if (window.isUploadingActive) return;
  const pill = document.getElementById('navUploadProgress');
  const text = document.getElementById('navUploadText');
  if (!pill || !text) return;
  try {
    const p = await (await fetch('/api/migration-progress')).json();
    if (p.active) {
      pill.style.display = 'flex';
      text.textContent = `Telegram ${p.index}/${p.total}: ${p.pct}%`;
      pill.title = `Moving "${p.title}" to Telegram (${p.index}/${p.total}) - ${p.pct}%`;
      window.migrationBadgeShown = true;
    } else if (window.migrationBadgeShown) {
      pill.style.display = 'none';
      window.migrationBadgeShown = false;
      if (typeof fetchMovies === 'function') fetchMovies();
    }
  } catch (e) {}
}, 3000);
