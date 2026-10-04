'use strict';

// Persistent state: settings, long-term memory and saved conversations.
// Everything lives in one JSON file in the app's userData folder.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, safeStorage } = require('electron');

const SETTING_KEYS = new Set([
  'shortcuts.panel',
  'shortcuts.window',
  'shortcuts.selection',
  'sense.activeWindow',
  'sense.clipboard',
  'model',
  'accent',
  'dnd',
  'launchAtLogin',
]);

const MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5'];

function defaultSettings() {
  const folders = ['documents', 'downloads', 'desktop']
    .map((name) => {
      try {
        return app.getPath(name);
      } catch {
        return null;
      }
    })
    .filter((p) => p && fs.existsSync(p));

  return {
    shortcuts: { panel: 'Alt+Space', window: 'Alt+Shift+Space', selection: 'Alt+A' },
    sense: { activeWindow: true, clipboard: true },
    folders,
    model: MODELS[0],
    accent: '#0071E3',
    dnd: false,
    launchAtLogin: false,
    apiKey: null,
  };
}

function mergeDefaults(target, defaults) {
  for (const [key, value] of Object.entries(defaults)) {
    if (!(key in target)) target[key] = value;
    else if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object') {
      mergeDefaults(target[key], value);
    }
  }
  return target;
}

class Store {
  constructor() {
    this.file = path.join(app.getPath('userData'), 'orbita.json');
    this.data = this.load();
    this.timer = null;
  }

  load() {
    const empty = { settings: defaultSettings(), memory: [], conversations: [] };
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      const data = mergeDefaults(raw, empty);
      mergeDefaults(data.settings, empty.settings);
      if (!MODELS.includes(data.settings.model)) data.settings.model = MODELS[0];
      return data;
    } catch {
      return empty;
    }
  }

  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 300);
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }

  // ---- settings ----

  get settings() {
    return this.data.settings;
  }

  getSetting(dotKey) {
    return dotKey.split('.').reduce((obj, key) => (obj == null ? undefined : obj[key]), this.settings);
  }

  setSetting(dotKey, value) {
    if (!SETTING_KEYS.has(dotKey)) throw new Error(`Unknown setting: ${dotKey}`);
    if (dotKey === 'model' && !MODELS.includes(value)) throw new Error('Unknown model');
    const keys = dotKey.split('.');
    const last = keys.pop();
    const parent = keys.reduce((obj, key) => obj[key], this.settings);
    parent[last] = value;
    this.save();
  }

  addFolder(folder) {
    if (!this.settings.folders.includes(folder)) {
      this.settings.folders.push(folder);
      this.save();
    }
  }

  removeFolder(folder) {
    this.settings.folders = this.settings.folders.filter((f) => f !== folder);
    this.save();
  }

  setApiKey(key) {
    if (!key) {
      this.settings.apiKey = null;
    } else if (safeStorage.isEncryptionAvailable()) {
      this.settings.apiKey = { enc: true, value: safeStorage.encryptString(key).toString('base64') };
    } else {
      this.settings.apiKey = { enc: false, value: key };
    }
    this.save();
  }

  getApiKey() {
    const stored = this.settings.apiKey;
    if (stored && stored.value) {
      try {
        return stored.enc ? safeStorage.decryptString(Buffer.from(stored.value, 'base64')) : stored.value;
      } catch {
        return null;
      }
    }
    return process.env.ANTHROPIC_API_KEY || null;
  }

  publicSettings() {
    const { apiKey, ...rest } = this.settings;
    return {
      ...rest,
      hasApiKey: Boolean(apiKey && apiKey.value),
      keyFromEnv: !(apiKey && apiKey.value) && Boolean(process.env.ANTHROPIC_API_KEY),
      keyEncrypted: safeStorage.isEncryptionAvailable(),
    };
  }

  // ---- memory ----

  get memory() {
    return this.data.memory;
  }

  addMemory(text) {
    const item = { id: crypto.randomUUID(), text: String(text).trim().slice(0, 500), createdAt: Date.now() };
    if (!item.text) return null;
    this.data.memory.push(item);
    this.save();
    return item;
  }

  removeMemory(id) {
    this.data.memory = this.data.memory.filter((m) => m.id !== id);
    this.save();
  }

  // ---- conversations ----

  listConversations() {
    return this.data.conversations
      .map(({ id, title, updatedAt }) => ({ id, title, updatedAt }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getConversation(id) {
    return this.data.conversations.find((c) => c.id === id) || null;
  }

  upsertConversation(conv) {
    const index = this.data.conversations.findIndex((c) => c.id === conv.id);
    if (index === -1) this.data.conversations.push(conv);
    else this.data.conversations[index] = conv;
    this.save();
  }

  removeConversation(id) {
    this.data.conversations = this.data.conversations.filter((c) => c.id !== id);
    this.save();
  }
}

module.exports = { Store, MODELS };
