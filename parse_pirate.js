const fs = require('fs');
const html = fs.readFileSync('pirate_full.html', 'utf8');

// find all links containing mega, mediafire, drive, or pirate download
const re = /href=["']([^"']*(?:mega\.nz|mediafire|drive\.google|piratelk\.com\/(?:download|get|\?p=)[^"']*|\.zip|\.srt))["']/gi;
let m;
while ((m = re.exec(html)) !== null) {
  console.log('Direct URL:', m[1]);
}
