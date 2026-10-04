'use strict';

const path = require('path');
const crypto = require('crypto');
const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  nativeTheme,
  screen,
  shell,
} = require('electron');

const { Store } = require('./src/store');
const { Assistant } = require('./src/assistant');
const desktop = require('./src/context');
const { trayIcon, appIcon } = require('./src/icon');

const isMac = process.platform === 'darwin';
const PANEL_MARGIN = 24; // room for the CSS shadow around the panel
const PANEL_SIZE = { width: 760, height: 560 };
const TRAY_SIZE = { width: 380, height: 520 };

let store;
let assistant;
let panelWin = null;
let appWin = null;
let trayWin = null;
let tray = null;
let quitting = false;
let pendingNav = null;

const smokeMode = Boolean(process.env.ORBITA_SMOKE);

app.setName('Орбита');
if (process.env.ORBITA_USER_DATA) app.setPath('userData', process.env.ORBITA_USER_DATA);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showApp());
  app.whenReady().then(init);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rendererFile = (name) => path.join(__dirname, 'renderer', name);

const webPreferences = {
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  spellcheck: false,
};

function harden(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event) => event.preventDefault());
}

// ---------------------------------------------------------------- state

function publicState() {
  return {
    platform: process.platform,
    settings: store.publicSettings(),
    memory: store.memory,
    conversations: store.listConversations(),
  };
}

function broadcast(channel, payload) {
  for (const win of [panelWin, appWin, trayWin]) {
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

let stateTimer = null;
function broadcastState() {
  clearTimeout(stateTimer);
  stateTimer = setTimeout(() => broadcast('state:changed', publicState()), 30);
}

// ---------------------------------------------------------------- panel

function createPanel() {
  panelWin = new BrowserWindow({
    width: PANEL_SIZE.width + PANEL_MARGIN * 2,
    height: PANEL_SIZE.height + PANEL_MARGIN * 2,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences,
  });
  panelWin.setAlwaysOnTop(true, 'floating');
  panelWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  panelWin.on('blur', () => {
    if (!panelWin.webContents.isDevToolsOpened() && !smokeMode) hidePanel();
  });
  harden(panelWin);
  panelWin.loadFile(rendererFile('panel.html'));
}

async function captureContext(extra = {}) {
  const sense = store.settings.sense;
  const ctx = { app: '', window: '', clipboard: '', selection: extra.selection || '' };
  if (sense.activeWindow) {
    const front = await desktop.activeWindow();
    if (front && !/^(orbita|орбита|electron)$/i.test(front.app)) Object.assign(ctx, front);
  }
  if (sense.clipboard && !ctx.selection) {
    const text = clipboard.readText().trim();
    if (text) ctx.clipboard = text.slice(0, 20000);
  }
  return ctx;
}

async function showPanel(extra = {}) {
  if (!panelWin) return;
  if (panelWin.isVisible() && !extra.selection) {
    hidePanel();
    return;
  }
  if (trayWin && trayWin.isVisible()) trayWin.hide();
  const ctx = await captureContext(extra);
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, width, height } = display.workArea;
  const w = PANEL_SIZE.width + PANEL_MARGIN * 2;
  panelWin.setBounds({ x: Math.round(x + (width - w) / 2), y: Math.round(y + height * 0.16), width: w, height: PANEL_SIZE.height + PANEL_MARGIN * 2 });
  panelWin.webContents.send('panel:show', ctx);
  panelWin.show();
  panelWin.focus();
}

function hidePanel() {
  if (!panelWin || !panelWin.isVisible()) return;
  panelWin.hide();
  // Hand focus back to the app the user was in.
  if (isMac && !(appWin && appWin.isVisible())) app.hide();
}

async function askAboutSelection() {
  const previous = clipboard.readText();
  clipboard.writeText('');
  await sleep(250); // let the user release the shortcut keys first
  await desktop.copySelection();
  await sleep(180);
  const selection = clipboard.readText().trim();
  clipboard.writeText(previous);
  showPanel({ selection: selection.slice(0, 20000) });
}

async function insertText(text) {
  clipboard.writeText(text);
  hidePanel();
  await sleep(isMac ? 250 : 150);
  return desktop.paste();
}

// ---------------------------------------------------------------- main window

function createAppWindow() {
  appWin = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 760,
    minHeight: 520,
    show: false,
    title: 'Орбита',
    icon: isMac ? undefined : appIcon(),
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 18, y: 20 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1E1E1E' : '#FFFFFF',
    autoHideMenuBar: true,
    webPreferences,
  });
  appWin.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    appWin.hide();
    if (isMac) app.dock.hide();
  });
  appWin.webContents.on('did-finish-load', () => {
    if (pendingNav) appWin.webContents.send('app:navigate', pendingNav);
    pendingNav = null;
  });
  harden(appWin);
  appWin.loadFile(rendererFile('app.html'));
}

function showApp(nav = null) {
  if (!appWin) createAppWindow();
  if (nav) {
    if (appWin.webContents.isLoading()) pendingNav = nav;
    else appWin.webContents.send('app:navigate', nav);
  }
  if (isMac) app.dock.show();
  appWin.show();
  appWin.focus();
}

// ---------------------------------------------------------------- tray

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip('Орбита');

  trayWin = new BrowserWindow({
    ...TRAY_SIZE,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences,
  });
  trayWin.on('blur', () => {
    if (!smokeMode) trayWin.hide();
  });
  harden(trayWin);
  trayWin.loadFile(rendererFile('tray.html'));

  const menu = Menu.buildFromTemplate([
    { label: 'Спросить Орбиту', click: () => showPanel() },
    { label: 'Открыть окно', click: () => showApp() },
    { label: 'Настройки…', click: () => showApp({ view: 'settings' }) },
    { type: 'separator' },
    { label: 'Выйти из Орбиты', click: () => quit() },
  ]);

  if (process.platform === 'linux') {
    // Many Linux desktops only deliver tray events through a context menu.
    tray.setContextMenu(menu);
    return;
  }
  tray.on('click', (_event, bounds) => toggleTrayWindow(bounds));
  tray.on('right-click', () => tray.popUpContextMenu(menu));
}

function toggleTrayWindow(bounds) {
  if (trayWin.isVisible()) {
    trayWin.hide();
    return;
  }
  const display = screen.getDisplayMatching(bounds);
  const area = display.workArea;
  let x = Math.round(bounds.x + bounds.width / 2 - TRAY_SIZE.width / 2);
  let y = bounds.y < area.y + area.height / 2 ? bounds.y + bounds.height + 4 : bounds.y - TRAY_SIZE.height - 4;
  x = Math.min(Math.max(x, area.x + 8), area.x + area.width - TRAY_SIZE.width - 8);
  y = Math.min(Math.max(y, area.y + 4), area.y + area.height - TRAY_SIZE.height - 4);
  trayWin.setPosition(x, y, false);
  trayWin.show();
  trayWin.focus();
}

// ---------------------------------------------------------------- shortcuts

const SHORTCUT_ACTIONS = {
  panel: () => showPanel(),
  window: () => showApp(),
  selection: () => askAboutSelection(),
};

// Returns the names of shortcuts that could not be registered.
function registerShortcuts() {
  globalShortcut.unregisterAll();
  if (store.settings.dnd) return [];
  const failed = [];
  for (const [name, action] of Object.entries(SHORTCUT_ACTIONS)) {
    const accelerator = store.settings.shortcuts[name];
    if (!accelerator) continue;
    let ok = false;
    try {
      ok = globalShortcut.register(accelerator, action);
    } catch {
      ok = false;
    }
    if (!ok) failed.push(name);
  }
  return failed;
}

// ---------------------------------------------------------------- IPC

function registerIpc() {
  ipcMain.handle('state:get', () => publicState());

  ipcMain.handle('settings:set', (_event, key, value) => {
    const previous = store.getSetting(key);
    try {
      store.setSetting(key, value);
    } catch (err) {
      return { ok: false, error: err.message };
    }
    if (key.startsWith('shortcuts.') || key === 'dnd') {
      const failed = registerShortcuts();
      const name = key.split('.')[1];
      if (key.startsWith('shortcuts.') && failed.includes(name)) {
        store.setSetting(key, previous);
        registerShortcuts();
        broadcastState();
        return { ok: false, error: 'Это сочетание занято другим приложением или системой.' };
      }
    }
    if (key === 'launchAtLogin') app.setLoginItemSettings({ openAtLogin: Boolean(value) });
    if (key === 'model') assistant.resetClient();
    broadcastState();
    return { ok: true };
  });

  ipcMain.handle('settings:apiKey', (_event, key) => {
    store.setApiKey(String(key || '').trim());
    assistant.resetClient();
    broadcastState();
    return { ok: true };
  });

  ipcMain.handle('settings:addFolder', async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(owner, { properties: ['openDirectory', 'multiSelections'] });
    for (const folder of result.filePaths) store.addFolder(folder);
    broadcastState();
  });

  ipcMain.handle('settings:removeFolder', (_event, folder) => {
    store.removeFolder(folder);
    broadcastState();
  });

  ipcMain.handle('memory:add', (_event, text) => {
    store.addMemory(text);
    broadcastState();
  });

  ipcMain.handle('memory:remove', (_event, id) => {
    store.removeMemory(id);
    broadcastState();
  });

  ipcMain.handle('conv:get', (_event, id) => assistant.viewConversation(id));
  ipcMain.handle('conv:remove', (_event, id) => assistant.remove(id));

  ipcMain.handle('chat:send', (_event, payload) => {
    try {
      return assistant.send(payload);
    } catch (err) {
      return { error: err.message };
    }
  });
  ipcMain.handle('chat:stop', (_event, id) => assistant.stop(id));
  ipcMain.handle('chat:newId', () => crypto.randomUUID());

  ipcMain.handle('files:pick', async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(owner, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Документы и изображения', extensions: ['pdf', 'txt', 'md', 'csv', 'json', 'html', 'xml', 'log', 'png', 'jpg', 'jpeg', 'gif', 'webp'] },
        { name: 'Все файлы', extensions: ['*'] },
      ],
    });
    return result.filePaths;
  });
  ipcMain.handle('files:reveal', (_event, file) => shell.showItemInFolder(file));

  ipcMain.handle('panel:hide', () => hidePanel());
  ipcMain.handle('panel:insert', (_event, text) => insertText(String(text)));
  ipcMain.handle('panel:copy', (_event, text) => clipboard.writeText(String(text)));
  ipcMain.handle('panel:openInChat', (_event, convId) => {
    hidePanel();
    if (convId && assistant.persist(convId)) showApp({ convId });
    else showApp();
  });
  ipcMain.handle('panel:show', () => showPanel());

  ipcMain.handle('app:open', (_event, nav) => {
    if (trayWin) trayWin.hide();
    showApp(nav || null);
  });
  ipcMain.handle('tray:hide', () => trayWin && trayWin.hide());
  ipcMain.handle('app:quit', () => quit());
}

// ---------------------------------------------------------------- lifecycle

function quit() {
  quitting = true;
  app.quit();
}

function init() {
  store = new Store();
  assistant = new Assistant(store, {
    emit: (convId, event) => broadcast('chat:event', { convId, ...event }),
    onStateChange: broadcastState,
  });

  if (isMac) app.dock.hide(); // Orbita lives in the menu bar until its window is opened
  else Menu.setApplicationMenu(null);

  registerIpc();
  createPanel();
  createTray();
  nativeTheme.on('updated', broadcastState);

  const failed = registerShortcuts();
  const { hasApiKey, keyFromEnv } = store.publicSettings();
  if (smokeMode) {
    require('./scripts/smoke')({
      store,
      assistant,
      showApp,
      toggleTrayWindow,
      quit,
      get appWin() { return appWin; },
      get panelWin() { return panelWin; },
      get trayWin() { return trayWin; },
    });
  } else if (failed.length || (!hasApiKey && !keyFromEnv)) {
    // First run, or a shortcut is taken: open the window so the user can fix it.
    showApp({ view: 'settings' });
  }
}

app.on('before-quit', () => {
  quitting = true;
  if (store) store.flush();
});

app.on('will-quit', () => globalShortcut.unregisterAll());

// Orbita keeps running in the tray when its windows are closed.
app.on('window-all-closed', () => {});
app.on('activate', () => showApp());
