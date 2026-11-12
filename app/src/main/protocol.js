'use strict';
// ml:// 프로토콜
//   ml://app/...    → 화면(renderer) 파일
//   ml://media/...  → 콘텐츠 폴더 파일 (영상 탐색을 위해 Range 요청 지원)

const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { protocol } = require('electron');
const { safeJoin } = require('./library');

const SCHEME = 'ml';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.vtt': 'text/vtt; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

function registerSchemes() {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
  ]);
}

function serveFile(root, rel, request) {
  let file;
  try {
    file = safeJoin(root, rel);
  } catch {
    return new Response('forbidden', { status: 403 });
  }
  let stat;
  try {
    stat = fs.statSync(file);
    if (!stat.isFile()) throw new Error();
  } catch {
    return new Response('not found', { status: 404 });
  }
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const size = stat.size;
  const range = request.headers.get('range');
  const m = range && range.match(/bytes=(\d*)-(\d*)/);
  if (m && (m[1] || m[2])) {
    let start = m[1] ? parseInt(m[1], 10) : size - parseInt(m[2], 10);
    let end = m[1] && m[2] ? parseInt(m[2], 10) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })), {
      status: 206,
      headers: {
        'Content-Type': type,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
      },
    });
  }
  return new Response(Readable.toWeb(fs.createReadStream(file)), {
    status: 200,
    headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' },
  });
}

function handleProtocol({ rendererDir, getLibraryPath }) {
  protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url);
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (url.hostname === 'app') return serveFile(rendererDir, rel || 'index.html', request);
    if (url.hostname === 'media') {
      const lib = getLibraryPath();
      if (!lib) return new Response('no library', { status: 404 });
      return serveFile(lib, rel, request);
    }
    return new Response('not found', { status: 404 });
  });
}

module.exports = { registerSchemes, handleProtocol, SCHEME };
