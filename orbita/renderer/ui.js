// Small DOM helpers shared by the panel, the main window and the tray.

export const api = window.orbita;
export const isMac = api.platform === 'darwin';

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'html') el.innerHTML = value; // only for trusted static markup (icons)
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

const PATHS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
  insert: '<path d="M9 10 4 15l5 5"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  list: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  wand: '<path d="m15 4 1.5 3L20 8.5 16.5 10 15 13l-1.5-3L10 8.5 13.5 7z"/><path d="m4 20 8-8"/>',
  reply: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v3"/>',
  send: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4h6v3"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  clipboard: '<rect x="8" y="3" width="8" height="4" rx="1"/><path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>',
  window: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
  power: '<path d="M12 3v9"/><path d="M6.3 7a8 8 0 1 0 11.4 0"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3"/>',
  palette: '<circle cx="12" cy="12" r="9"/><circle cx="8" cy="10" r="1.2"/><circle cx="12" cy="7.5" r="1.2"/><circle cx="16" cy="10" r="1.2"/><path d="M12 21a3 3 0 0 1 0-6h2"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  back: '<path d="M15 18 9 12l6-6"/>',
};

export function icon(name, size = '') {
  return `<svg class="i ${size}" viewBox="0 0 24 24" aria-hidden="true">${PATHS[name] || ''}</svg>`;
}

export function iconEl(name, size = '') {
  const span = document.createElement('span');
  span.style.display = 'contents';
  span.innerHTML = icon(name, size);
  return span.firstElementChild;
}

const MAC_KEYS = { CommandOrControl: '⌘', CmdOrCtrl: '⌘', Command: '⌘', Cmd: '⌘', Control: '⌃', Ctrl: '⌃', Alt: '⌥', Option: '⌥', Shift: '⇧', Super: '⌘', Meta: '⌘', Enter: '↩', Return: '↩', Space: 'Space' };
const PC_KEYS = { CommandOrControl: 'Ctrl', CmdOrCtrl: 'Ctrl', Command: 'Win', Cmd: 'Win', Control: 'Ctrl', Super: 'Win', Meta: 'Win', Return: 'Enter' };

export function keyLabels(accelerator) {
  if (!accelerator) return [];
  const map = isMac ? MAC_KEYS : PC_KEYS;
  return accelerator.split('+').map((k) => map[k] || k);
}

export const mod = isMac ? '⌘' : 'Ctrl+'; // prefix for shortcut hints: ⌘1 / Ctrl+1

export function kbdGroup(accelerator) {
  const wrap = h('span', { class: 'kbd-group' });
  for (const label of keyLabels(accelerator)) wrap.append(h('kbd', {}, label));
  return wrap;
}

// Builds an Electron accelerator from a keydown event, or null for a bare modifier.
export function acceleratorFromEvent(event) {
  const special = { ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Escape: 'Esc', Enter: 'Enter', Backspace: 'Backspace', Tab: 'Tab' };
  if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return null;
  let key = special[event.key];
  if (!key && /^Key[A-Z]$/.test(event.code)) key = event.code.slice(3);
  if (!key && /^Digit\d$/.test(event.code)) key = event.code.slice(5);
  if (!key && /^F\d{1,2}$/.test(event.key)) key = event.key;
  if (!key) return null;
  const parts = [];
  if (event.metaKey) parts.push(isMac ? 'Command' : 'Super');
  if (event.ctrlKey) parts.push('Control');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (!parts.length || (parts.length === 1 && parts[0] === 'Shift')) return null; // global shortcuts need a real modifier
  return [...parts, key].join('+');
}

export function applyAccent(color) {
  if (color) document.documentElement.style.setProperty('--accent', color);
}

export function wordCount(text) {
  return (String(text).match(/[\p{L}\p{N}]+/gu) || []).length;
}

export function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function words(n) {
  return `${n} ${plural(n, 'слово', 'слова', 'слов')}`;
}

export function basename(p) {
  return String(p).split(/[\\/]/).pop();
}

// Splits the <context> block that Orbita prepends to user messages.
export function parseContext(text) {
  const m = /^<context>\n([\s\S]*)\n<\/context>$/.exec(text);
  if (!m) return null;
  const body = m[1];
  const result = {};
  const win = /^Активное окно: (.+)$/m.exec(body);
  if (win) result.window = win[1];
  if (body.includes('Выделенный текст:')) result.selection = true;
  if (body.includes('Буфер обмена:')) result.clipboard = true;
  return result;
}

export function dayGroup(ts) {
  const d = new Date(ts);
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (ts >= start) return 'Сегодня';
  if (ts >= start - 86400000) return 'Вчера';
  if (ts >= start - 6 * 86400000) return 'На этой неделе';
  return d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}

export function relTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'только что';
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} мин назад`;
  if (diff < 86_400_000) {
    const hours = Math.round(diff / 3_600_000);
    return hours === 1 ? 'час назад' : `${hours} ${plural(hours, 'час', 'часа', 'часов')} назад`;
  }
  if (diff < 2 * 86_400_000) return 'вчера';
  return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

let toastTimer = null;
export function toast(text) {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', class: 'toast', role: 'status' });
    document.body.append(el);
  }
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 1800);
}

// Tool activity, worded for people.
export function describeTool(name, input) {
  const arg = input || {};
  if (name === 'search_files') return { icon: 'search', text: arg.query ? `Поиск файлов: «${arg.query}»` : 'Поиск файлов' };
  if (name === 'read_file') return { icon: 'doc', text: arg.path ? `Прочитан файл ${basename(arg.path)}` : 'Чтение файла' };
  if (name === 'remember') return { icon: 'bookmark', text: arg.fact ? `Запомнено: ${arg.fact}` : 'Запись в память' };
  return { icon: 'gear', text: name };
}

export function describeToolRunning(name, input) {
  const arg = input || {};
  if (name === 'search_files') return 'Ищу файлы…';
  if (name === 'read_file') return arg.path ? `Читаю ${basename(arg.path)}…` : 'Читаю файл…';
  if (name === 'remember') return 'Запоминаю…';
  return 'Работаю…';
}
