const { execSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');

for (const id of [40, 42, 44]) {
  try {
    const url = 'http://localhost:3000/api/telegram/file/' + id;
    console.log('Probing msg', id, 'from', url);
    execSync(`"${ffmpeg}" -i "${url}"`, { stdio: 'pipe', timeout: 20000 });
  } catch (err) {
    const output = (err.stderr ? err.stderr.toString() : err.message);
    console.log('Msg', id, 'Output:\n', output.slice(1000, 3000));
  }
}
