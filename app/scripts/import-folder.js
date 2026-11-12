#!/usr/bin/env node
'use strict';
// 사용법:
//   node scripts/import-folder.js <학습 자료 폴더...> [--out <콘텐츠 폴더>] [--only data,audio,extras,video]
//                                 [--force] [--encoder auto|nvenc|x264]
// 예) node scripts/import-folder.js "D:/videos/my-title" --out ../library --only data,audio,extras

const path = require('path');
const { convertFolder, ALL_STEPS } = require('../src/importer/convert');

function parseArgs(argv) {
  const opts = { dirs: [], out: path.resolve(__dirname, '..', '..', 'library'), steps: ALL_STEPS, force: false, encoder: 'auto' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') opts.out = path.resolve(argv[++i]);
    else if (a === '--only') opts.steps = argv[++i].split(',').map((s) => s.trim());
    else if (a === '--force') opts.force = true;
    else if (a === '--encoder') opts.encoder = argv[++i];
    else opts.dirs.push(a);
  }
  return opts;
}

(async () => {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.dirs.length) {
    console.error('변환할 폴더를 하나 이상 지정하세요.');
    process.exit(2);
  }
  let failed = 0;
  for (const dir of opts.dirs) {
    let lastPct = -1;
    try {
      const r = await convertFolder(dir, opts.out, {
        steps: opts.steps,
        force: opts.force,
        encoder: opts.encoder,
        log: (m) => console.log(m),
        onProgress: (step, ratio) => {
          const pct = Math.floor(ratio * 100);
          if (step === 'video' && pct !== lastPct && pct % 5 === 0) {
            lastPct = pct;
            console.log(`  영상 ${pct}%`);
          }
        },
      });
      for (const w of r.warnings) console.warn(`  ⚠ ${w}`);
      console.log(`✔ ${r.manifest.title} → ${r.outDir}`);
    } catch (e) {
      failed++;
      console.error(`✘ ${dir}\n  ${e.message}`);
    }
  }
  process.exit(failed ? 1 : 0);
})();
