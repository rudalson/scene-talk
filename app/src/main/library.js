'use strict';
// 콘텐츠 폴더 관리: 하위 폴더마다 manifest.json 이 있으면 하나의 타이틀로 본다.

const fs = require('fs');
const path = require('path');

const SUPPORTED_SCHEMA = 1;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function listTitles(libraryPath) {
  if (!libraryPath || !fs.existsSync(libraryPath)) return [];
  const out = [];
  for (const name of fs.readdirSync(libraryPath)) {
    if (name.startsWith('_') || name.startsWith('.')) continue;
    const dir = path.join(libraryPath, name);
    const mf = path.join(dir, 'manifest.json');
    if (!fs.existsSync(mf)) continue;
    try {
      const manifest = readJson(mf);
      if ((manifest.schemaVersion || 1) > SUPPORTED_SCHEMA) continue;
      manifest.id = name; // 폴더 이름이 곧 ID
      out.push({
        manifest,
        hasVideo: fs.existsSync(path.join(dir, manifest.video || 'movie.mp4')),
      });
    } catch (e) {
      console.warn(`manifest 읽기 실패: ${mf}`, e.message);
    }
  }
  return out.sort((a, b) => a.manifest.title.localeCompare(b.manifest.title, 'ko'));
}

function getTitle(libraryPath, id) {
  const dir = safeJoin(libraryPath, id);
  const manifest = readJson(path.join(dir, 'manifest.json'));
  manifest.id = id;
  const load = (rel, fallback) => {
    if (!rel) return fallback;
    const f = safeJoin(dir, rel);
    return fs.existsSync(f) ? readJson(f) : fallback;
  };
  return {
    manifest,
    script: load(manifest.script, { cues: [] }),
    exercises: load(manifest.exercises, { dictation: [], listening: [] }),
    hasVideo: fs.existsSync(safeJoin(dir, manifest.video || 'movie.mp4')),
  };
}

// 콘텐츠 팩 폴더(manifest.json 포함)를 콘텐츠 폴더로 복사
function copyPack(src, libraryPath) {
  const mf = path.join(src, 'manifest.json');
  if (!fs.existsSync(mf)) throw new Error('선택한 폴더에 manifest.json 이 없습니다.');
  const manifest = readJson(mf);
  const id = manifest.id || path.basename(src);
  const dest = path.join(libraryPath, id);
  if (path.resolve(src) === path.resolve(dest)) return id;
  if (fs.existsSync(dest)) throw new Error(`같은 ID의 콘텐츠가 이미 있습니다: ${id}`);
  fs.cpSync(src, dest, { recursive: true });
  return id;
}

// root 바깥으로 벗어나는 경로를 막는다.
function safeJoin(root, rel) {
  const base = path.resolve(root);
  const full = path.resolve(base, rel);
  if (full !== base && !full.startsWith(base + path.sep)) throw new Error('잘못된 경로');
  return full;
}

module.exports = { listTitles, getTitle, copyPack, safeJoin };
