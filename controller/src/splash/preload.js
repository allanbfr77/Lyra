'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('splash', {
  onProgress: (cb) => ipcRenderer.on('splash:progress', (_e, d) => cb(d)),
  onWarn:     (cb) => ipcRenderer.on('splash:warn',     (_e, d) => cb(d)),
  onError:    (cb) => ipcRenderer.on('splash:error',    (_e, d) => cb(d)),
  onDone:     (cb) => ipcRenderer.on('splash:done',     () => cb()),
  relaunch:   ()   => ipcRenderer.send('splash:relaunch'),
  quit:       ()   => ipcRenderer.send('splash:quit'),
});
