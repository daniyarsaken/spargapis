'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('orbita', {
  platform: process.platform,

  getState: () => invoke('state:get'),
  onState: (cb) => subscribe('state:changed', cb),

  settings: {
    set: (key, value) => invoke('settings:set', key, value),
    setApiKey: (key) => invoke('settings:apiKey', key),
    addFolder: () => invoke('settings:addFolder'),
    removeFolder: (folder) => invoke('settings:removeFolder', folder),
  },

  memory: {
    add: (text) => invoke('memory:add', text),
    remove: (id) => invoke('memory:remove', id),
  },

  conversations: {
    get: (id) => invoke('conv:get', id),
    remove: (id) => invoke('conv:remove', id),
  },

  chat: {
    newId: () => invoke('chat:newId'),
    send: (payload) => invoke('chat:send', payload),
    stop: (convId) => invoke('chat:stop', convId),
    onEvent: (cb) => subscribe('chat:event', cb),
  },

  files: {
    pick: () => invoke('files:pick'),
    reveal: (file) => invoke('files:reveal', file),
  },

  panel: {
    show: () => invoke('panel:show'),
    hide: () => invoke('panel:hide'),
    insert: (text) => invoke('panel:insert', text),
    copy: (text) => invoke('panel:copy', text),
    openInChat: (convId) => invoke('panel:openInChat', convId),
    onShow: (cb) => subscribe('panel:show', cb),
  },

  app: {
    open: (nav) => invoke('app:open', nav),
    onNavigate: (cb) => subscribe('app:navigate', cb),
    quit: () => invoke('app:quit'),
  },

  tray: {
    hide: () => invoke('tray:hide'),
  },
});
