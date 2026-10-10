// Mini serveur média local : sert les fichiers locaux, transcode à la volée
// (MKV, HEVC, AC3, DTS…) en MP4 fragmenté lisible par Chromium, et convertit
// les sous-titres en WebVTT.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');

const unpacked = (p) => (p ? p.replace('app.asar', 'app.asar.unpacked') : p);

// Binaire embarqué (ffmpeg-static / ffprobe-static) ou, à défaut, celui du système
function binPath(mod, key) {
  try {
    const m = require(mod);
    const p = unpacked(key ? m[key] : m);
    return p && fs.existsSync(p) ? p : null;
  } catch {
    return null;
  }
}

const FFMPEG = binPath('ffmpeg-static') || 'ffmpeg';
const FFPROBE = binPath('@ffprobe-installer/ffprobe', 'path') || 'ffprobe';

const MIME = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mkv': 'video/x-matroska', '.webm': 'video/webm',
  '.mov': 'video/quicktime', '.avi': 'video/x-msvideo', '.ts': 'video/mp2t',
};

const TEXT_SUB_CODECS = new Set(['subrip', 'ass', 'ssa', 'webvtt', 'mov_text', 'text', 'srt']);

let server = null;
let serverPort = 0;
const running = new Set();

const isUrl = (s) => /^https?:\/\//i.test(s);

function inputArgs(src) {
  return isUrl(src)
    ? ['-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5', '-i', src]
    : ['-i', src];
}

function encoderArgs(enc) {
  switch (enc) {
    case 'h264_nvenc':
      return ['-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '23', '-pix_fmt', 'yuv420p'];
    case 'h264_qsv':
      return ['-c:v', 'h264_qsv', '-preset', 'veryfast', '-global_quality', '23', '-pix_fmt', 'nv12'];
    case 'h264_amf':
      return ['-c:v', 'h264_amf', '-quality', 'speed', '-rc', 'cqp', '-qp_i', '22', '-qp_p', '22', '-pix_fmt', 'yuv420p'];
    default:
      return ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p'];
  }
}

function pipeProcess(req, res, args, contentType) {
  const proc = spawn(FFMPEG, args, { windowsHide: true });
  running.add(proc);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  proc.stdout.pipe(res);
  let errTail = '';
  proc.stderr.on('data', (d) => { errTail = (errTail + d.toString()).slice(-2000); });
  const kill = () => { if (!proc.killed) proc.kill('SIGKILL'); };
  req.on('close', kill);
  proc.on('close', (code) => {
    running.delete(proc);
    if (code && code !== 255) console.error('[ffmpeg]', code, errTail);
    res.end();
  });
  proc.on('error', (err) => {
    running.delete(proc);
    console.error('[ffmpeg] spawn error', err);
    res.end();
  });
}

function serveFile(req, res, filePath) {
  let stat;
  try { stat = fs.statSync(filePath); } catch { res.writeHead(404); return res.end(); }
  const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  const range = req.headers.range;
  if (!range) {
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes' });
    return fs.createReadStream(filePath).pipe(res);
  }
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  let start = m && m[1] ? parseInt(m[1], 10) : 0;
  let end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1;
  if (!m || !m[1]) { // suffixe : bytes=-N
    if (m && m[2]) { start = Math.max(0, stat.size - parseInt(m[2], 10)); end = stat.size - 1; }
  }
  end = Math.min(end, stat.size - 1);
  if (start > end || start >= stat.size) {
    res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
    return res.end();
  }
  res.writeHead(206, {
    'Content-Type': type,
    'Content-Length': end - start + 1,
    'Content-Range': `bytes ${start}-${end}/${stat.size}`,
    'Accept-Ranges': 'bytes',
  });
  fs.createReadStream(filePath, { start, end }).pipe(res);
}

function handle(req, res) {
  const u = new URL(req.url, 'http://127.0.0.1');
  const q = u.searchParams;

  if (u.pathname === '/file') {
    return serveFile(req, res, q.get('path') || '');
  }

  // Vidéo -> MP4 fragmenté. mode=remux : vidéo copiée, audio en AAC (léger)
  //                          mode=full  : vidéo réencodée en H.264
  if (u.pathname === '/stream') {
    const src = q.get('src');
    if (!src) { res.writeHead(400); return res.end(); }
    const t = Math.max(0, parseFloat(q.get('t') || '0') || 0);
    const audio = q.get('a');
    const mode = q.get('mode') === 'full' ? 'full' : 'remux';
    const args = ['-hide_banner', '-loglevel', 'error', '-nostdin'];
    if (t > 0) args.push('-ss', t.toFixed(3));
    args.push(...inputArgs(src));
    args.push('-map', '0:v:0', '-map', audio ? `0:${parseInt(audio, 10)}` : '0:a:0?', '-sn', '-dn');
    if (mode === 'full') {
      args.push(...encoderArgs(q.get('enc')), '-g', '60', '-vf', "scale='min(1920,iw)':-2");
    } else {
      args.push('-c:v', 'copy');
      // HEVC copié en MP4 : Chromium (décodage matériel) attend le tag hvc1
      if (q.get('hevc') === '1') args.push('-tag:v', 'hvc1');
    }
    // aresample=async : recale l'audio sur l'horloge vidéo (évite les décalages image/son)
    args.push('-af', 'aresample=async=1000:first_pts=0', '-c:a', 'aac', '-ac', '2', '-b:a', '192k',
      '-avoid_negative_ts', 'make_zero', '-max_muxing_queue_size', '2048',
      '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', 'pipe:1');
    return pipeProcess(req, res, args, 'video/mp4');
  }

  // Sous-titres internes (index absolu du flux) ou externes (url) -> WebVTT
  if (u.pathname === '/subs') {
    const src = q.get('src');
    if (!src) { res.writeHead(400); return res.end(); }
    const idx = q.get('i');
    const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', ...inputArgs(src)];
    if (idx != null) args.push('-map', `0:${parseInt(idx, 10)}`);
    args.push('-f', 'webvtt', 'pipe:1');
    return pipeProcess(req, res, args, 'text/vtt; charset=utf-8');
  }

  res.writeHead(404);
  res.end();
}

function start() {
  return new Promise((resolve) => {
    server = http.createServer(handle);
    server.listen(0, '127.0.0.1', () => {
      serverPort = server.address().port;
      resolve(serverPort);
    });
  });
}

function stop() {
  for (const p of running) { try { p.kill('SIGKILL'); } catch {} }
  running.clear();
  if (server) server.close();
}

function probe(src) {
  return new Promise((resolve) => {
    const args = ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams'];
    if (isUrl(src)) args.push('-rw_timeout', '15000000');
    args.push(src);
    execFile(FFPROBE, args, { timeout: 30000, maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (err, stdout) => {
      if (err) return resolve({ ok: false, error: String(err.message || err) });
      try {
        const j = JSON.parse(stdout);
        const streams = j.streams || [];
        const v = streams.find((s) => s.codec_type === 'video' && !(s.disposition && s.disposition.attached_pic));
        const tag = (s, k) => (s.tags && (s.tags[k] || s.tags[k.toUpperCase()])) || '';
        resolve({
          ok: true,
          duration: parseFloat((j.format && j.format.duration) || '0') || 0,
          format: (j.format && j.format.format_name) || '',
          video: v ? {
            codec: v.codec_name, profile: v.profile || '', pixFmt: v.pix_fmt || '',
            width: v.width, height: v.height, colorTransfer: v.color_transfer || '',
          } : null,
          audios: streams.filter((s) => s.codec_type === 'audio').map((s) => ({
            index: s.index, codec: s.codec_name, channels: s.channels || 2,
            lang: tag(s, 'language'), title: tag(s, 'title'),
            isDefault: !!(s.disposition && s.disposition.default),
          })),
          subs: streams.filter((s) => s.codec_type === 'subtitle').map((s) => ({
            index: s.index, codec: s.codec_name, lang: tag(s, 'language'), title: tag(s, 'title'),
            text: TEXT_SUB_CODECS.has(s.codec_name),
            forced: !!(s.disposition && s.disposition.forced),
          })),
        });
      } catch (e) {
        resolve({ ok: false, error: String(e.message || e) });
      }
    });
  });
}

// Position de l'image-clé juste avant t : en remux (vidéo copiée) ffmpeg démarre
// forcément sur une image-clé, il faut donc la connaître pour garder le minutage exact.
function keyframeBefore(src, t) {
  return new Promise((resolve) => {
    if (!(t > 0)) return resolve(0);
    const args = ['-v', 'error', '-select_streams', 'v:0', '-skip_frame', 'nokey',
      '-show_entries', 'frame=pts_time,pkt_pts_time,best_effort_timestamp_time', '-of', 'csv=p=0',
      '-read_intervals', `${Math.max(0, t - 20).toFixed(3)}%${(t + 0.5).toFixed(3)}`, src];
    execFile(FFPROBE, args, { timeout: 15000, maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (err, stdout) => {
      if (err) return resolve(t);
      let best = -1;
      for (const line of stdout.split(/\r?\n/)) {
        for (const v of line.split(',')) {
          const x = parseFloat(v);
          if (isFinite(x) && x <= t + 0.01 && x > best) best = x;
        }
      }
      resolve(best >= 0 ? best : t);
    });
  });
}

let capsCache = null;
function capabilities() {
  if (capsCache) return Promise.resolve(capsCache);
  return new Promise((resolve) => {
    execFile(FFMPEG, ['-hide_banner', '-encoders'], { timeout: 10000, windowsHide: true }, (err, stdout) => {
      if (err) return resolve({ ffmpeg: false, encoders: [] });
      const encoders = ['libx264', 'h264_nvenc', 'h264_qsv', 'h264_amf'].filter((e) => stdout.includes(e));
      capsCache = { ffmpeg: true, encoders };
      resolve(capsCache);
    });
  });
}

module.exports = { start, stop, probe, capabilities, keyframeBefore, port: () => serverPort };
