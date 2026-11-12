'use strict';
// build/icon.svg → build/icon.png(512), build/icon.ico(16~256), src/renderer/assets/icon.png
// 실행: npx electron scripts/make-icon.js
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');

const ROOT = path.join(__dirname, '..');
const SVG = fs.readFileSync(path.join(ROOT, 'build', 'icon.svg'), 'utf8');
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

function buildIco(pngs) {
  // ICO 헤더 + 디렉터리 + PNG 데이터 (Vista 이후 PNG 압축 ICO 지원)
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = 6 + dir.length;
  pngs.forEach(({ size, buf }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt8(0, o + 2);
    dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(buf.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += buf.length;
  });
  return Buffer.concat([header, dir, ...pngs.map((p) => p.buf)]);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadURL('data:text/html,<html><body></body></html>');
  const sizes = [...ICO_SIZES, 512];
  const urls = await win.webContents.executeJavaScript(`(async () => {
    const svg = ${JSON.stringify(SVG)};
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    const out = {};
    for (const n of ${JSON.stringify(sizes)}) {
      const c = document.createElement('canvas');
      c.width = c.height = n;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, n, n);
      out[n] = c.toDataURL('image/png');
    }
    return out;
  })()`);
  const png = (n) => Buffer.from(urls[n].split(',')[1], 'base64');

  fs.writeFileSync(path.join(ROOT, 'build', 'icon.png'), png(512));
  fs.writeFileSync(path.join(ROOT, 'build', 'icon.ico'), buildIco(ICO_SIZES.map((n) => ({ size: n, buf: png(n) }))));
  const assets = path.join(ROOT, 'src', 'renderer', 'assets');
  fs.mkdirSync(assets, { recursive: true });
  fs.writeFileSync(path.join(assets, 'icon.png'), png(256));
  fs.copyFileSync(path.join(ROOT, 'build', 'icon.svg'), path.join(assets, 'icon.svg'));
  console.log('아이콘 생성 완료:', sizes.join(', '));
  app.quit();
});
