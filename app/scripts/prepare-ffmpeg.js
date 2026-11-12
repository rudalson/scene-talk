'use strict';
// 패키징 전에 ffmpeg.exe 를 vendor/ffmpeg/ 로 복사한다. (FFMPEG_PATH 또는 PATH의 ffmpeg)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let src = process.env.FFMPEG_PATH;
if (!src) {
  try {
    src = execSync('where ffmpeg', { encoding: 'utf8' }).split(/\r?\n/)[0].trim();
  } catch {
    console.error('ffmpeg.exe 를 찾지 못했습니다. FFMPEG_PATH 를 지정하세요.');
    process.exit(1);
  }
}
const destDir = path.join(__dirname, '..', 'vendor', 'ffmpeg');
fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, path.join(destDir, 'ffmpeg.exe'));
const lic = path.join(path.dirname(src), '..', 'LICENSE');
if (fs.existsSync(lic)) fs.copyFileSync(lic, path.join(destDir, 'LICENSE.txt'));
console.log(`ffmpeg 복사: ${src} → ${destDir}`);
