const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('nocta', {
  platform: process.platform,
  store: {
    load: () => ipcRenderer.sendSync('store:load'),
    save: (data) => ipcRenderer.invoke('store:save', data),
  },
  http: (url, opts) => ipcRenderer.invoke('http:json', url, opts),
  media: {
    port: () => ipcRenderer.invoke('media:port'),
    probe: (src) => ipcRenderer.invoke('media:probe', src),
    capabilities: () => ipcRenderer.invoke('media:capabilities'),
    keyframe: (src, t) => ipcRenderer.invoke('media:keyframe', src, t),
  },
  torbox: (method, ...args) => ipcRenderer.invoke('torbox:call', method, ...args),
  player: {
    available: () => ipcRenderer.invoke('player:available'),
    open: (req) => ipcRenderer.invoke('player:open', req),
    load: (req) => ipcRenderer.invoke('player:load', req),
    cmd: (...args) => ipcRenderer.invoke('player:cmd', args),
    close: () => ipcRenderer.invoke('player:close'),
    info: (info) => ipcRenderer.invoke('player:info', info),
    next: () => ipcRenderer.invoke('player:next'),
    ready: () => ipcRenderer.invoke('player:ready'),
    fullscreen: () => ipcRenderer.invoke('player:fullscreen'),
    minimize: () => ipcRenderer.invoke('player:minimize'),
    on: (channel, cb) => {
      const fn = (_e, data) => cb(data);
      ipcRenderer.on(channel, fn);
      return () => ipcRenderer.removeListener(channel, fn);
    },
  },
  openVideoDialog: () => ipcRenderer.invoke('dialog:openVideo'),
  pathForFile: (file) => webUtils.getPathForFile(file),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  win: {
    toggleFullscreen: () => ipcRenderer.invoke('win:toggleFullscreen'),
    setFullscreen: (v) => ipcRenderer.invoke('win:setFullscreen', v),
    onFullscreen: (cb) => {
      const fn = (_e, v) => cb(v);
      ipcRenderer.on('win:fullscreen', fn);
      return () => ipcRenderer.removeListener('win:fullscreen', fn);
    },
  },
});
