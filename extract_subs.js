const { execSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const fs = require('fs');

console.log('Extracting Aranmanai 4 (msg 44)...');
const dest = 'uploads/subtitles/aranmanai-4-2024.vtt';
execSync(`"${ffmpeg}" -y -i "http://localhost:3000/api/telegram/file/44" -map 0:s:0 -c:s webvtt "${dest}"`, { stdio: 'inherit' });
console.log('Finished Aranmanai 4! Size:', fs.statSync(dest).size);
