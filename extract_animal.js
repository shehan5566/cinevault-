const { execSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const fs = require('fs');

console.log('Extracting Animal (2023) (msg 40)...');
const dest = 'uploads/subtitles/animal-2023.vtt';
execSync(`"${ffmpeg}" -y -i "http://localhost:3000/api/telegram/file/40" -map 0:s:0 -c:s webvtt "${dest}"`, { stdio: 'inherit' });
console.log('Finished Animal (2023)! Size:', fs.statSync(dest).size);
