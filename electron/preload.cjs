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
