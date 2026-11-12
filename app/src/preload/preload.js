'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ml', {
  listLibrary: () => ipcRenderer.invoke('library:list'),
  getTitle: (id) => ipcRenderer.invoke('library:get', id),
  chooseLibrary: () => ipcRenderer.invoke('library:choose'),
  openLibrary: () => ipcRenderer.invoke('library:open'),
  openExtra: (id, file) => ipcRenderer.invoke('extras:open', id, file),
  setProgress: (id, patch) => ipcRenderer.invoke('progress:set', id, patch),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  pickFolder: (title) => ipcRenderer.invoke('dialog:folder', title),
  importPack: (src) => ipcRenderer.invoke('import:pack', src),
  convertFolder: (src) => ipcRenderer.invoke('import:convert', src),
  onImportEvent: (cb) => {
    const fn = (_e, msg) => cb(msg);
    ipcRenderer.on('import:event', fn);
    return () => ipcRenderer.removeListener('import:event', fn);
  },
});
