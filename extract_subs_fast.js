const { exec } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const path = require('path');
const fs = require('fs');

const subDir = path.join(__dirname, 'uploads', 'subtitles');
if (!fs.existsSync(subDir)) fs.mkdirSync(subDir, { recursive: true });

const movies = JSON.parse(fs.readFileSync('./data/movies.json', 'utf8'));
const got = movies.find(m => m.id === 'mov-1791551210889');

async function processEpisodes() {
  if (!got || !got.seasons) return;

  const tasks = [];
  got.seasons.forEach((season, sIdx) => {
    season.episodes.forEach((ep, eIdx) => {
      if (ep.videoUrl) {
        const videoFilename = path.basename(ep.videoUrl);
        const videoPath = path.join(__dirname, 'uploads', 'videos', videoFilename);
        const vttFilename = videoFilename.replace(/\.[^/.]+$/, '') + '.vtt';
        const vttPath = path.join(subDir, vttFilename);

        tasks.push(new Promise((resolve) => {
          if (!fs.existsSync(videoPath)) return resolve(false);

          exec(`"${ffmpegPath}" -y -i "${videoPath}" -map 0:s:0 "${vttPath}"`, (err) => {
            if (fs.existsSync(vttPath) && fs.statSync(vttPath).size > 100) {
              ep.subtitleUrl = '/uploads/subtitles/' + vttFilename;
              resolve(true);
            } else {
              resolve(false);
            }
          });
        }));
      }
    });
  });

  const results = await Promise.all(tasks);
  const successCount = results.filter(Boolean).length;

  if (got.seasons[0] && got.seasons[0].episodes[0]) {
    got.subtitleUrl = got.seasons[0].episodes[0].subtitleUrl || '';
  }

  fs.writeFileSync('./data/movies.json', JSON.stringify(movies, null, 2), 'utf8');
  console.log(`🎉 Processed all ${tasks.length} episodes! Successfully extracted subtitles for ${successCount} episodes.`);
}

processEpisodes();
