const fs = require('fs');
const path = require('path');

function cleanVTT(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  // Remove BOMs anywhere
  content = content.replace(/\uFEFF/g, '');

  const lines = content.split(/\r?\n/);
  const cues = [];
  let currentCue = null;

  const timeRegex = /(\d{1,2}:\d{2}:\d{2}[\.,]\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[\.,]\d{3})/;

  function parseTime(t) {
    const parts = t.replace(',', '.').split(':');
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const s = parseFloat(parts[2]);
    return h * 3600 + m * 60 + s;
  }

  function formatTime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.round((sec - Math.floor(sec)) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === 'WEBVTT' || line === '') {
      if (currentCue && currentCue.text.length > 0) {
        cues.push(currentCue);
        currentCue = null;
      }
      continue;
    }

    const match = line.match(timeRegex);
    if (match) {
      if (currentCue && currentCue.text.length > 0) {
        cues.push(currentCue);
      }
      const startSec = parseTime(match[1]);
      const endSec = parseTime(match[2]);
      currentCue = {
        startSec,
        endSec,
        startStr: formatTime(startSec),
        endStr: formatTime(endSec),
        text: []
      };
      continue;
    }

    if (currentCue) {
      // Check if line is just cue number (e.g. "123")
      if (/^\d+$/.test(line) && currentCue.text.length === 0) {
        continue;
      }
      // Clean HTML tags that might break VTT, e.g. <font ...> or {\an5}
      let cleaned = line
        .replace(/\{\\an\d\}/g, '')
        .replace(/<font[^>]*>/gi, '')
        .replace(/<\/font>/gi, '')
        .trim();

      if (cleaned.length > 0) {
        currentCue.text.push(cleaned);
      }
    }
  }

  if (currentCue && currentCue.text.length > 0) {
    cues.push(currentCue);
  }

  // Sort cues by start time
  cues.sort((a, b) => a.startSec - b.startSec);

  // Rebuild pure WebVTT
  let out = 'WEBVTT\n\n';
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    out += `${c.startStr} --> ${c.endStr}\n`;
    out += c.text.join('\n') + '\n\n';
  }

  fs.writeFileSync(filePath, out, 'utf8');
  console.log(`Cleaned ${path.basename(filePath)}: ${cues.length} valid cues written.`);
}

cleanVTT(path.join(__dirname, 'uploads', 'subtitles', 'animal-2023.vtt'));
cleanVTT(path.join(__dirname, 'uploads', 'subtitles', 'aranmanai-4-2024.vtt'));
