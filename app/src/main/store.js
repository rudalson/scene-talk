'use strict';
// 설정과 학습 기록을 사용자 데이터 폴더(%APPDATA%/SceneTalk)에 JSON으로 저장한다.
// 콘텐츠 폴더와 분리되어 있어 콘텐츠를 교체해도 기록이 남는다.

const fs = require('fs');
const path = require('path');

class JsonFile {
  constructor(file, defaults) {
    this.file = file;
    this.data = defaults;
    try {
      this.data = { ...defaults, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
    } catch {
      /* 처음 실행 또는 손상된 파일 → 기본값 */
    }
    this.timer = null;
  }
  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 300);
  }
  flush() {
    clearTimeout(this.timer);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
  }
}

function createStores(userDataDir) {
  const settings = new JsonFile(path.join(userDataDir, 'settings.json'), {
    libraryPath: null,
    subtitleMode: 'both', // en | ko | both | off
    playbackRate: 1,
    subtitleScale: 1,
    repeatCount: 3,
    volume: 1,
  });
  const progress = new JsonFile(path.join(userDataDir, 'progress.json'), { titles: {} });

  return {
    settings,
    progress,
    getProgress(id) {
      return (
        progress.data.titles[id] || { position: 0, updatedAt: null, bookmarks: [], dictation: {}, listening: {}, words: [] }
      );
    },
    setProgress(id, patch) {
      const cur = this.getProgress(id);
      progress.data.titles[id] = { ...cur, ...patch, updatedAt: new Date().toISOString() };
      progress.save();
      return progress.data.titles[id];
    },
    flushAll() {
      settings.flush();
      progress.flush();
    },
  };
}

module.exports = { createStores };
