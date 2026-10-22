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
    langs: (src) => ipcRenderer.invoke('media:langs', src),
    capabilities: () => ipcRenderer.invoke('media:capabilities'),
    keyframe: (src, t) => ipcRenderer.invoke('media:keyframe', src, t),
  },
  player: {
    available: () => ipcRenderer.invoke('player:available'),
    open: (req) => ipcRenderer.invoke('player:open', req),
    load: (req) => ipcRenderer.invoke('player:load', req),
    cmd: (...args) => ipcRenderer.invoke('player:cmd', args),
    close: () => ipcRenderer.invoke('player:close'),
    info: (info) => ipcRenderer.invoke('player:info', info),
    next: () => ipcRenderer.invoke('player:next'),
    ready: () => ipcRenderer.invoke('player:ready'),
    intro: (mark) => ipcRenderer.invoke('player:intro', mark),
    fullscreen: () => ipcRenderer.invoke('player:fullscreen'),
    minimize: () => ipcRenderer.invoke('player:minimize'),
    remoteState: (st) => ipcRenderer.invoke('player:remote', st),
    subsync: (job) => ipcRenderer.invoke('player:subsync', job),
    action: (name, data) => ipcRenderer.invoke('player:action', name, data),
    ambilight: (mode) => ipcRenderer.invoke('player:ambilight', mode),
    on: (channel, cb) => {
      const fn = (_e, data) => cb(data);
      ipcRenderer.on(channel, fn);
      return () => ipcRenderer.removeListener(channel, fn);
    },
  },
  openVideoDialog: () => ipcRenderer.invoke('dialog:openVideo'),
  pathForFile: (file) => webUtils.getPathForFile(file),
  openLogs: () => ipcRenderer.invoke('app:openLogs'),
  quit: () => ipcRenderer.invoke('app:quit'),
  intro: {
    detect: (job) => ipcRenderer.invoke('intro:detect', job),
    has: (seriesId, videoId) => ipcRenderer.invoke('intro:has', seriesId, videoId),
  },
  addons: {
    openWindow: (url) => ipcRenderer.invoke('addons:openWindow', url),
    onInstall: (cb) => {
      const fn = (_e, url) => cb(url);
      ipcRenderer.on('addons:install', fn);
      return () => ipcRenderer.removeListener('addons:install', fn);
    },
  },
  remote: {
    status: () => ipcRenderer.invoke('remote:status'),
    setEnabled: (v) => ipcRenderer.invoke('remote:setEnabled', v),
    reset: () => ipcRenderer.invoke('remote:reset'),
    on: (channel, cb) => {
      const fn = (_e, data) => cb(data);
      ipcRenderer.on(`remote:${channel}`, fn);
      return () => ipcRenderer.removeListener(`remote:${channel}`, fn);
    },
  },
  update: {
    status: () => ipcRenderer.invoke('update:status'),
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
    on: (cb) => {
      const fn = (_e, st) => cb(st);
      ipcRenderer.on('update:status', fn);
      return () => ipcRenderer.removeListener('update:status', fn);
    },
  },
  assistant: {
    create: (req) => ipcRenderer.invoke('assistant:create', req),
    testKey: (key) => ipcRenderer.invoke('assistant:testKey', key),
  },
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  win: {
    toggleFullscreen: () => ipcRenderer.invoke('win:toggleFullscreen'),
    isFullscreen: () => ipcRenderer.invoke('win:isFullscreen'),
    setFullscreen: (v) => ipcRenderer.invoke('win:setFullscreen', v),
    onFullscreen: (cb) => {
      const fn = (_e, v) => cb(v);
      ipcRenderer.on('win:fullscreen', fn);
      return () => ipcRenderer.removeListener('win:fullscreen', fn);
    },
  },
});
