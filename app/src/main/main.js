'use strict';

const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const { registerSchemes, handleProtocol } = require('./protocol');
const { createStores } = require('./store');
const library = require('./library');
const { convertFolder } = require('../importer/convert');

registerSchemes();
if (!app.isPackaged && process.env.ML_USERDATA) app.setPath('userData', process.env.ML_USERDATA);
if (!app.isPackaged && process.env.ML_SHOTS) app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

const RENDERER_DIR = path.join(__dirname, '..', 'renderer');
let stores;
let win;

// ---------------------------------------------------------------- 경로

function bundledTool(name) {
  // 패키징된 exe에는 resources/ffmpeg/ 에 ffmpeg 를 함께 넣는다.
  const p = path.join(process.resourcesPath || '', 'ffmpeg', `${name}.exe`);
  return app.isPackaged && fs.existsSync(p) ? p : null;
}

function defaultLibraryPath() {
  const candidates = [];
  if (app.isPackaged) {
    // 포터블 실행: exe 옆의 "SceneTalk Library" 폴더
    const exeDir = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath);
    candidates.push(path.join(exeDir, 'SceneTalk Library'));
  } else {
    candidates.push(path.resolve(__dirname, '..', '..', '..', 'library'));
  }
  const found = candidates.find((p) => fs.existsSync(p));
  return found || path.join(app.getPath('documents'), 'SceneTalk Library');
}

function libraryPath() {
  const p = stores.settings.data.libraryPath;
  return p && fs.existsSync(p) ? p : defaultLibraryPath();
}

// 예전 이름(Movielang)으로 저장된 설정·학습 기록을 처음 한 번 옮겨 온다.
function migrateUserData() {
  const dir = app.getPath('userData');
  const old = path.join(app.getPath('appData'), 'Movielang');
  if (path.resolve(old) === path.resolve(dir) || !fs.existsSync(old)) return;
  for (const f of ['settings.json', 'progress.json']) {
    const from = path.join(old, f);
    const to = path.join(dir, f);
    try {
      if (fs.existsSync(from) && !fs.existsSync(to)) {
        fs.mkdirSync(dir, { recursive: true });
        fs.copyFileSync(from, to);
      }
    } catch {
      /* 옮기지 못하면 새로 시작 */
    }
  }
}

// ---------------------------------------------------------------- 창

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#0E1014',
    title: '씬톡',
    icon: path.join(RENDERER_DIR, 'assets', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: !process.env.ML_SHOTS,
    },
  });
  win.loadURL('ml://app/index.html');
  // 외부 링크는 기본 브라우저로
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  if (!app.isPackaged && process.env.ML_DEVTOOLS) win.webContents.openDevTools({ mode: 'detach' });
  if (!app.isPackaged && process.env.ML_SHOTS) require('./devshots')(win, process.env.ML_SHOTS);
}

// ---------------------------------------------------------------- IPC

function registerIpc() {
  ipcMain.handle('library:list', () => {
    const lib = libraryPath();
    return {
      libraryPath: lib,
      titles: library.listTitles(lib).map((t) => ({ ...t, progress: stores.getProgress(t.manifest.id) })),
    };
  });
  ipcMain.handle('library:get', (_e, id) => {
    const t = library.getTitle(libraryPath(), id);
    return { ...t, progress: stores.getProgress(id), baseUrl: `ml://media/${encodeURIComponent(id)}/` };
  });
  ipcMain.handle('library:choose', async () => {
    const r = await dialog.showOpenDialog(win, { title: '콘텐츠 폴더 선택', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    stores.settings.data.libraryPath = r.filePaths[0];
    stores.settings.save();
    return r.filePaths[0];
  });
  ipcMain.handle('library:open', () => {
    const lib = libraryPath();
    fs.mkdirSync(lib, { recursive: true });
    return shell.openPath(lib);
  });
  ipcMain.handle('extras:open', (_e, id, rel) => shell.openPath(library.safeJoin(path.join(libraryPath(), id), rel)));

  ipcMain.handle('progress:set', (_e, id, patch) => stores.setProgress(id, patch));
  ipcMain.handle('settings:get', () => stores.settings.data);
  ipcMain.handle('settings:set', (_e, patch) => {
    Object.assign(stores.settings.data, patch);
    stores.settings.save();
    return stores.settings.data;
  });

  ipcMain.handle('dialog:folder', async (_e, title) => {
    const r = await dialog.showOpenDialog(win, { title, properties: ['openDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle('import:pack', (_e, src) => {
    const lib = libraryPath();
    fs.mkdirSync(lib, { recursive: true });
    return library.copyPack(src, lib);
  });

  ipcMain.handle('import:convert', async (e, src) => {
    const lib = libraryPath();
    fs.mkdirSync(lib, { recursive: true });
    const send = (msg) => !e.sender.isDestroyed() && e.sender.send('import:event', msg);
    const steps = ['data', 'audio', 'extras', 'video'];
    let current = null;
    try {
      const r = await convertFolder(src, lib, {
        steps,
        log: (m) => send({ type: 'log', message: m }),
        onStep: (step, status, detail) => {
          current = step;
          send({ type: 'step', step, status, detail });
        },
        onProgress: (step, ratio) => {
          current = step;
          send({ type: 'progress', step, ratio });
        },
      });
      send({ type: 'done', id: r.id, warnings: r.warnings });
      return { id: r.id, warnings: r.warnings };
    } catch (err) {
      send({ type: 'error', step: current, message: err.message });
      throw err;
    }
  });
}

// ---------------------------------------------------------------- 시작

app.whenReady().then(() => {
  migrateUserData();
  stores = createStores(app.getPath('userData'));
  const ff = bundledTool('ffmpeg');
  if (ff) process.env.FFMPEG_PATH = ff;

  Menu.setApplicationMenu(null);
  handleProtocol({ rendererDir: RENDERER_DIR, getLibraryPath: libraryPath });
  registerIpc();
  createWindow();
});

app.on('before-quit', () => stores && stores.flushAll());
app.on('window-all-closed', () => app.quit());
