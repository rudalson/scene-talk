'use strict';
// 개발용: ML_SHOTS=출력폴더 로 실행하면 주요 화면을 캡처하고 종료한다.
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

module.exports = async function devShots(win, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const wc = win.webContents;
  const errors = [];
  wc.on('console-message', (_e, level, message, line, source) => {
    if (level >= 2) errors.push(`${message} (${source}:${line})`);
  });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await new Promise((r) => wc.once('did-finish-load', r));
  const shots = (process.env.ML_SHOT_LIST || '#/library').split('@@');
  for (const [i, hash] of shots.entries()) {
    const i2 = hash.indexOf('|'); const h = i2 < 0 ? hash : hash.slice(0, i2); const js = i2 < 0 ? '' : hash.slice(i2 + 1);
    await wc.executeJavaScript(`location.hash = ${JSON.stringify(h)}`);
    await wait(2500);
    if (js) {
      await wc.executeJavaScript(js).catch((e) => errors.push('script: ' + e.message));
      await wait(1500);
    }
    wc.invalidate();
    await wait(300);
    let img = await wc.capturePage();
    if (img.isEmpty()) { await wait(1500); img = await wc.capturePage(); }
    errors.push(`shot ${i + 1} ${h}: ${img.getSize().width}x${img.getSize().height} text=${await wc.executeJavaScript('document.body.innerText.length')}`);
    fs.writeFileSync(path.join(outDir, `${String(i + 1).padStart(2, '0')}.png`), img.toPNG());
  }
  fs.writeFileSync(path.join(outDir, 'console-errors.txt'), errors.join('\n'));
  app.quit();
};
