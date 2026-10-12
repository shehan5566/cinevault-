const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

const movieId = 'mov-1791538091030';
const inputFilePath = path.resolve(__dirname, '..', 'uploads', 'videos', 'video-1791538005601-966866088.mp4');
const hlsDir = path.resolve(__dirname, '..', 'uploads', 'hls', movieId);

fs.mkdirSync(hlsDir, { recursive: true });

console.log('Testing HLS Transcoding with FFmpeg...');
console.log('Input File Exists?', fs.existsSync(inputFilePath));

if (!fs.existsSync(inputFilePath)) {
  console.error('Input file not found at:', inputFilePath);
  process.exit(1);
}

const args = [
  '-i', inputFilePath,
  '-preset', 'ultrafast',
  '-t', '20',
  '-g', '48',
  '-sc_threshold', '0',
  '-map', '0:v:0', '-map', '0:a:0?', '-map', '0:v:0', '-map', '0:a:0?',
  '-s:v:0', '1920x1080', '-c:v:0', 'libx264', '-b:v:0', '3500k',
  '-s:v:1', '1280x720',  '-c:v:1', 'libx264', '-b:v:1', '1800k',
  '-c:a', 'aac', '-b:a', '128k',
  '-var_stream_map', 'v:0,a:0,name:1080p v:1,a:1,name:720p',
  '-master_pl_name', 'master.m3u8',
  '-f', 'hls',
  '-hls_time', '4',
  '-hls_playlist_type', 'vod',
  '-hls_segment_filename', path.join(hlsDir, '%v_%03d.ts'),
  path.join(hlsDir, '%v.m3u8')
];

execFile(ffmpegPath, args, (err, stdout, stderr) => {
  if (err) {
    console.error('FFmpeg Error:', err.message);
  } else {
    console.log('HLS Transcoding Finished Successfully!');
    console.log('Master HLS Playlist generated at:', path.join(hlsDir, 'master.m3u8'));
  }
});
