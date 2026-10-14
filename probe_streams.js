const { execSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');

[40, 44].forEach(msgId => {
  try {
    execSync(`"${ffmpeg}" -i "http://localhost:3000/api/telegram/file/${msgId}"`, { stdio: 'pipe' });
  } catch(e) {
    const s = (e.stderr ? e.stderr.toString() : '');
    const idx = s.indexOf('Input #0');
    console.log('=== MSG ' + msgId + ' ===');
    console.log(s.slice(idx + 1000, idx + 3000));
  }
});
