// Telegram MTProto storage (gramjs): files up to 2GB (Bot API is limited to 50MB).
const fs = require('fs');
const path = require('path');
const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { CustomFile } = require('telegram/client/uploads');
const bigInt = require('big-integer');

const API_ID = parseInt(process.env.TELEGRAM_API_ID || '36910273', 10);
const API_HASH = process.env.TELEGRAM_API_HASH || '304b219a9e2cd12e50d14d74bcef11c6';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8538231781:AAFJ27AnEuZK22-TnUM15wRgYWdU2Zvihz0';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '-1003955449040';
const SESSION_FILE = path.join(__dirname, 'data', 'tg_session.txt');
const DEFAULT_SESSION = '1BQANOTEuMTA4LjU2LjE3MAG7lOmXKIk7MMKQmW7yK8DgCNwMs8ysC4oowqIu2BZVTNfo6vtsL6qsLo5MzLXtBnNeJS96oExUXTBy6LUDSvI1pj4vilzHQTuIll/aaIo+z4zpd2xJFNZRDAGuAFMQEb96hUH/GmBMngvB44kizThkEGYNQZD4RE0NdwnCjPgoj02A34Dg1+Vy/9Ky/UBaVgS9NacPM1La0iomyHvkM05gDidn2FCO2pMzPO0jfvHMtK1yd0y0J5Ciiywib3Fe0gjreB2hDy30k3n/9hjQpB1lFYGlYxW/Hz0CSF1f66q5UySTtD+dAn32EKS0/Vn1xyB4l9KcAXg9aWkBRoco7oBdLg==';

let clientPromise = null;

function isConfigured() {
  return !!(API_ID && API_HASH);
}

let peerCache = null;
async function getPeer() {
  // accessHash 0 is rejected by messages.SendMedia (CHANNEL_INVALID), so resolve the real hash once.
  if (peerCache) return peerCache;
  const client = await getClient();
  const raw = String(CHAT_ID).replace(/^-100/, '').replace(/^-/, '');
  const res = await client.invoke(new Api.channels.GetChannels({
    id: [new Api.InputChannel({ channelId: BigInt(raw), accessHash: BigInt(0) })]
  }));
  const ch = res.chats && res.chats[0];
  if (!ch) throw new Error('Channel not found - is the bot an admin of the channel?');
  peerCache = new Api.InputPeerChannel({ channelId: ch.id, accessHash: ch.accessHash });
  return peerCache;
}

async function getClient() {
  if (!isConfigured()) throw new Error('TELEGRAM_API_ID / TELEGRAM_API_HASH missing in .env');
  if (!clientPromise) {
    clientPromise = (async () => {
      const saved = (process.env.TELEGRAM_SESSION && process.env.TELEGRAM_SESSION.trim()) || 
        (fs.existsSync(SESSION_FILE) ? fs.readFileSync(SESSION_FILE, 'utf8').trim() : '') || 
        DEFAULT_SESSION;
      const client = new TelegramClient(new StringSession(saved), API_ID, API_HASH, {
        connectionRetries: 15,
        retryDelay: 2000,
        timeout: 60000
      });
      await client.start({ botAuthToken: BOT_TOKEN });
      try {
        fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
        fs.writeFileSync(SESSION_FILE, client.session.save());
      } catch (err) {}
      return client;
    })().catch(err => { clientPromise = null; throw err; });
  }
  return clientPromise;
}

// Uploads a video to the channel; returns { messageId, size } or null on failure.
async function uploadFile(filePath, fileName, caption, onProgress, thumbPath = null) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const client = await getClient();
      const size = fs.statSync(filePath).size;
      const sendOpts = {
        file: new CustomFile(fileName, size, filePath),
        caption: caption || fileName,
        forceDocument: true,
        workers: 2,
        progressCallback: (p) => {
          if (onProgress) onProgress(p);
          process.stdout.write(`\r[Telegram MTProto] Upload ${(p * 100).toFixed(1)}%   `);
        }
      };
      if (thumbPath && fs.existsSync(thumbPath)) {
        sendOpts.thumb = thumbPath;
      }
      const msg = await client.sendFile(await getPeer(), sendOpts);
      console.log(`\n[Telegram MTProto] Uploaded ${fileName}, message id ${msg.id}`);
      return { messageId: msg.id, size };
    } catch (err) {
      console.error(`\n[Telegram MTProto] Upload error (attempt ${attempt}/3):`, err.message);
      if (attempt < 3) {
        console.log('[Telegram MTProto] Retrying in 5 seconds...');
        await new Promise(r => setTimeout(r, 5000));
      } else {
        return null;
      }
    }
  }
  return null;
}

async function getMedia(messageId) {
  const client = await getClient();
  const msgs = await client.getMessages(await getPeer(), { ids: [Number(messageId)] });
  const msg = msgs && msgs[0];
  if (!msg || !msg.media || !msg.media.document) return null;
  return { client, media: msg.media, size: Number(msg.media.document.size), msg };
}

// Streams a stored message's file with HTTP Range support.
async function streamToResponse(messageId, req, res, { download = false, filename = 'movie.mp4' } = {}) {
  const info = await getMedia(messageId);
  if (!info) return res.status(404).send('Telegram file not found');
  const { client, media, size, msg } = info;
  const CHUNK = 512 * 1024;

  let finalFilename = filename;
  const origName = (msg && msg.file && msg.file.name) || '';
  const origExt = (origName && path.extname(origName)) || ((media.document.mimeType && media.document.mimeType.includes('matroska')) ? '.mkv' : '.mp4');
  if (origExt && !finalFilename.toLowerCase().endsWith(origExt.toLowerCase())) {
    finalFilename = finalFilename.replace(/\.[^/.]+$/, '') + origExt;
  }

  let start = 0, end = size - 1;
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      if (m[1]) start = parseInt(m[1], 10);
      if (m[2]) end = Math.min(parseInt(m[2], 10), size - 1);
      if (!m[1] && m[2]) { start = Math.max(size - parseInt(m[2], 10), 0); end = size - 1; }
    }
    if (start > end || start >= size) {
      res.status(416).setHeader('Content-Range', `bytes */${size}`);
      return res.end();
    }
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
  }
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Length', end - start + 1);
  res.setHeader('Content-Type', download ? (media.document.mimeType || 'video/x-matroska') : 'video/mp4');
  if (download) {
    const safeAscii = finalFilename.replace(/["\\]/g, '').replace(/[^\x20-\x7E]/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(finalFilename)}`);
  }

  const alignedStart = start - (start % CHUNK);
  let skip = start - alignedStart;
  let remaining = end - start + 1;
  let closed = false;
  req.on('close', () => { closed = true; });

  try {
    for await (const chunk of client.iterDownload({
      file: media,
      offset: bigInt(alignedStart),
      requestSize: CHUNK,
      fileSize: bigInt(size)
    })) {
      if (closed) break;
      let buf = chunk;
      if (skip) { buf = buf.subarray(skip); skip = 0; }
      if (buf.length > remaining) buf = buf.subarray(0, remaining);
      if (!res.write(buf)) await new Promise(r => res.once('drain', r));
      remaining -= buf.length;
      if (remaining <= 0) break;
    }
  } catch (err) {
    console.error('[Telegram MTProto] Stream error:', err.message);
  }
  res.end();
}

module.exports = { isConfigured, getClient, uploadFile, streamToResponse };
