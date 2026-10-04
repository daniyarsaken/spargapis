import {
  api, h, icon, iconEl, isMac, kbdGroup, acceleratorFromEvent, applyAccent, basename, parseContext,
  dayGroup, relTime, toast, describeTool, describeToolRunning,
} from './ui.js';
import { renderMarkdown } from './markdown.js';

const $ = (id) => document.getElementById(id);
if (isMac) document.body.classList.add('mac');

let state = null;
let currentId = null; // open conversation
let conv = null; // its view from the main process
let attachments = [];
let pendingText = ''; // restored into the composer if a request fails
const live = new Map(); // convId -> { text, tools: [], notice }
let view = 'chat';
let infoHidden = false;
let settingsSection = 'keys';

$('searchIcon').innerHTML = icon('search', 'sm');
$('newChatBtn').innerHTML = icon('plus');
$('gearIcon').innerHTML = icon('gear', 'sm');
$('backIcon').innerHTML = icon('back', 'sm');
$('deleteBtn').innerHTML = icon('trash');
$('infoBtn').innerHTML = icon('sidebar');
$('attachBtn').innerHTML = icon('plus', 'sm');

// ============================================================ sidebar

function renderSidebar() {
  const list = $('convList');
  const query = $('search').value.trim().toLowerCase();
  const convs = state.conversations.filter((c) => !query || c.title.toLowerCase().includes(query));
  list.replaceChildren();
  if (!convs.length) {
    list.append(h('div', { class: 'empty-list' }, query ? 'Ничего не найдено' : 'Здесь появятся ваши разговоры'));
    return;
  }
  let group = null;
  for (const c of convs) {
    const g = dayGroup(c.updatedAt);
    if (g !== group) {
      group = g;
      list.append(h('div', { class: 'group-title' }, g));
    }
    list.append(
      h(
        'button',
        { class: 'conv', 'aria-current': String(c.id === currentId && view === 'chat'), onclick: () => openConversation(c.id), title: c.title },
        h('span', {}, c.title),
        live.has(c.id) ? h('i', { class: 'dot', 'aria-label': 'Отвечает' }) : null,
      ),
    );
  }
}

$('search').addEventListener('input', renderSidebar);
$('newChatBtn').addEventListener('click', newChat);
$('settingsLink').addEventListener('click', () => showSettings());
$('backToChat').addEventListener('click', () => showChat());

// ============================================================ chat

async function openConversation(id) {
  currentId = id;
  conv = await api.conversations.get(id);
  if (!conv) {
    currentId = null;
  }
  showChat();
}

function newChat() {
  currentId = null;
  conv = null;
  attachments = [];
  showChat();
  $('input').focus();
}

function showChat() {
  view = 'chat';
  $('app').classList.remove('settings-mode');
  $('settingsView').hidden = true;
  $('sideChat').hidden = false;
  $('sideSettings').hidden = true;
  $('settingsLink').hidden = false;
  renderSidebar();
  renderChat();
}

function renderChat() {
  $('chatTitle').textContent = conv ? conv.title : 'Новый разговор';
  $('chatSub').textContent = conv ? relTime(conv.updatedAt) : '';
  $('deleteBtn').hidden = !conv;
  $('app').classList.toggle('no-info', infoHidden);
  renderMessages();
  renderInfo();
  renderComposer();
}

function renderMessages() {
  const inner = $('messagesInner');
  inner.replaceChildren();

  if (!conv || !conv.messages.length) {
    if (!live.has(currentId)) {
      inner.append(renderEmpty());
      return;
    }
  }

  // tool_use id -> ok?, from the tool results that follow
  const toolStatus = new Map();
  for (const m of conv ? conv.messages : []) {
    for (const b of m.content) if (b.type === 'tool_result') toolStatus.set(b.tool_use_id, !b.is_error);
  }

  let group = null;
  for (const msg of conv ? conv.messages : []) {
    if (msg.role === 'user') {
      if (msg.content.every((b) => b.type === 'tool_result')) continue;
      if (group) finishGroup(group);
      group = null;
      inner.append(renderUser(msg));
    } else {
      if (!group) {
        group = h('div', { class: 'msg assistant' });
        group.texts = [];
        inner.append(group);
      }
      appendAssistant(group, msg, toolStatus);
    }
  }
  if (group) finishGroup(group);

  const stream = live.get(currentId);
  if (stream) inner.append(renderLive(stream));
  scrollToBottom(true);
}

function renderEmpty() {
  const suggestions = [
    'Найди в Загрузках последние договоры и сравни их',
    'Что ты обо мне помнишь?',
    'Запомни: я предпочитаю короткие ответы с таблицей',
    'Помоги составить план на неделю',
  ];
  return h(
    'div',
    { class: 'empty' },
    h('span', { class: 'mark', 'aria-hidden': 'true' }),
    h('h2', {}, 'Чем помочь?'),
    h('p', {}, 'Спросите что угодно или прикрепите файл.'),
    h(
      'div',
      { class: 'suggestions' },
      suggestions.map((s) =>
        h('button', { class: 'pill', onclick: () => { $('input').value = s; autosize(); $('input').focus(); } }, s),
      ),
    ),
  );
}

function renderUser(msg) {
  const chips = h('div', { class: 'msg-chips' });
  let text = '';
  for (const block of msg.content) {
    if (block.type === 'text') {
      const ctx = parseContext(block.text);
      if (ctx) {
        if (ctx.window) chips.append(chip('window', ctx.window));
        if (ctx.selection) chips.append(chip('clipboard', 'Выделенный текст'));
        if (ctx.clipboard) chips.append(chip('clipboard', 'Буфер обмена'));
      } else {
        text = block.text;
      }
    } else if (block.type === 'document') {
      chips.append(chip('doc', block.title || 'Документ'));
    } else if (block.type === 'image') {
      chips.append(chip('image', 'Изображение'));
    }
  }
  return h('div', { class: 'msg user' }, chips.childElementCount ? chips : null, text ? h('div', { class: 'bubble' }, text) : null);
}

function chip(iconName, label) {
  return h('span', { class: 'chip', title: label }, iconEl(iconName, 'xs'), h('span', {}, label));
}

function appendAssistant(group, msg, toolStatus) {
  let activity = null;
  for (const block of msg.content) {
    if (block.type === 'tool_use') {
      if (!activity) {
        activity = h('div', { class: 'activity' });
        group.append(activity);
      }
      const d = describeTool(block.name, block.input);
      const ok = toolStatus.get(block.id);
      activity.append(
        h('div', { class: `activity-line ${ok === false ? 'fail' : 'ok'}` }, iconEl(ok === false ? 'close' : 'check', 'sm'), h('span', { title: d.text }, d.text)),
      );
    } else if (block.type === 'text' && block.text.trim()) {
      activity = null;
      group.texts.push(block.text);
      group.append(h('div', { class: 'md', html: renderMarkdown(block.text) }));
    }
  }
}

function finishGroup(group) {
  const text = group.texts.join('\n\n').trim();
  if (!text) return;
  group.append(
    h(
      'div',
      { class: 'msg-actions' },
      h('button', {
        class: 'icon-btn',
        'aria-label': 'Копировать ответ',
        html: icon('copy', 'sm'),
        onclick: async () => {
          await navigator.clipboard.writeText(text);
          toast('Скопировано');
        },
      }),
    ),
  );
}

function renderLive(stream) {
  const el = h('div', { class: 'msg assistant', id: 'liveGroup' });
  if (stream.tools.length) {
    const activity = h('div', { class: 'activity' });
    for (const t of stream.tools) {
      const label = t.done ? describeTool(t.name, t.input).text : describeToolRunning(t.name, t.input);
      const cls = t.done ? (t.ok ? 'ok' : 'fail') : '';
      activity.append(h('div', { class: `activity-line ${cls}` }, iconEl(t.done ? (t.ok ? 'check' : 'close') : t.name === 'search_files' ? 'search' : 'doc', 'sm'), h('span', {}, label)));
    }
    el.append(activity);
  }
  if (stream.text.trim()) el.append(h('div', { class: 'md', html: renderMarkdown(stream.text) }));
  if (stream.notice) el.append(h('div', { class: 'notice' }, stream.notice));
  el.append(h('span', { class: 'typing', 'aria-label': 'Орбита пишет' }, h('span'), h('span'), h('span')));
  return el;
}

let liveQueued = false;
function updateLive() {
  if (liveQueued) return;
  liveQueued = true;
  requestAnimationFrame(() => {
    liveQueued = false;
    const stream = live.get(currentId);
    const old = $('liveGroup');
    if (!stream || view !== 'chat') return;
    const empty = $('messagesInner').querySelector('.empty');
    if (empty) empty.remove();
    const next = renderLive(stream);
    if (old) old.replaceWith(next);
    else $('messagesInner').append(next);
    scrollToBottom(false);
  });
}

function scrollToBottom(force) {
  const box = $('messages');
  if (force || box.scrollHeight - box.scrollTop - box.clientHeight < 120) box.scrollTop = box.scrollHeight;
}

// ============================================================ info panel

function renderInfo() {
  const files = $('infoFiles');
  files.replaceChildren(h('div', { class: 'info-label' }, 'Файлы'));
  if (conv && conv.files.length) {
    const card = h('div', { class: 'group-card' });
    for (const file of conv.files) {
      const name = basename(file);
      const ext = name.split('.').pop().toLowerCase();
      const kind = ext === 'pdf' ? '' : ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext) ? 'img' : 'txt';
      card.append(
        h(
          'button',
          { class: 'group-row', title: `Показать в папке: ${file}`, onclick: () => api.files.reveal(file) },
          h('span', { class: `file-badge ${kind}` }, ext.slice(0, 4).toUpperCase()),
          h('span', { class: 'grow' }, name),
        ),
      );
    }
    files.append(card);
  } else {
    files.append(h('div', { class: 'info-hint' }, 'Файлы, которые вы прикрепите или Орбита прочитает, появятся здесь.'));
  }

  const memory = $('infoMemory');
  memory.replaceChildren(h('div', { class: 'info-label' }, 'Орбита помнит'));
  if (state.memory.length) {
    const card = h('div', { class: 'group-card' });
    for (const m of state.memory.slice(-6).reverse()) card.append(h('div', { class: 'group-row' }, h('span', { class: 'grow' }, m.text)));
    memory.append(card);
  } else {
    memory.append(h('div', { class: 'info-hint' }, 'Пока ничего. Скажите «запомни, что…» — и Орбита учтёт это в следующих разговорах.'));
  }
  memory.append(h('a', { href: '#', class: 'info-hint', onclick: (e) => { e.preventDefault(); showSettings('memory'); } }, 'Управлять памятью…'));
}

$('infoBtn').addEventListener('click', () => {
  infoHidden = !infoHidden;
  $('app').classList.toggle('no-info', infoHidden);
});

$('deleteBtn').addEventListener('click', async () => {
  if (!conv) return;
  if (!confirm(`Удалить разговор «${conv.title}»?`)) return;
  await api.conversations.remove(conv.id);
  newChat();
});

// ============================================================ composer

function renderComposer() {
  const busy = live.has(currentId);
  const btn = $('sendBtn');
  btn.innerHTML = icon(busy ? 'stop' : 'send', 'sm');
  btn.setAttribute('aria-label', busy ? 'Остановить' : 'Отправить');
  btn.disabled = !busy && !$('input').value.trim() && !attachments.length;

  const box = $('attachments');
  box.replaceChildren(
    ...attachments.map((file) =>
      h(
        'span',
        { class: 'chip', title: file },
        iconEl('doc', 'xs'),
        h('span', {}, basename(file)),
        h('button', {
          type: 'button',
          'aria-label': `Убрать ${basename(file)}`,
          html: icon('close'),
          onclick: () => {
            attachments = attachments.filter((f) => f !== file);
            renderComposer();
          },
        }),
      ),
    ),
  );

  const s = state.settings;
  $('composerNote').textContent = s.hasApiKey || s.keyFromEnv ? '' : 'Чтобы Орбита могла отвечать, добавьте API-ключ Anthropic в настройках.';
}

function autosize() {
  const input = $('input');
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 220)}px`;
  renderComposer();
}

$('input').addEventListener('input', autosize);
$('input').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    $('composer').requestSubmit();
  }
});

$('attachBtn').addEventListener('click', async () => {
  const files = await api.files.pick();
  for (const f of files) if (!attachments.includes(f)) attachments.push(f);
  renderComposer();
  $('input').focus();
});

$('composer').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (live.has(currentId)) {
    api.chat.stop(currentId);
    return;
  }
  const text = $('input').value.trim();
  if (!text && !attachments.length) return;

  const id = currentId || (await api.chat.newId());
  const files = attachments;
  pendingText = text;
  $('input').value = '';
  attachments = [];
  autosize();

  const result = await api.chat.send({ convId: id, scope: 'app', text, attachments: files });
  if (result && result.error) {
    $('input').value = text;
    attachments = files;
    autosize();
    toast(result.error);
    return;
  }
  currentId = id;
  conv = await api.conversations.get(id);
  renderChat();
  renderSidebar();
});

// ============================================================ streaming events

api.chat.onEvent(async (event) => {
  const { convId } = event;
  if (event.type === 'start') {
    live.set(convId, { text: '', tools: [], notice: '' });
    if (convId === currentId) renderComposer();
    renderSidebar();
    return;
  }
  const stream = live.get(convId);

  switch (event.type) {
    case 'textStart':
      if (stream && stream.text && !stream.text.endsWith('\n\n')) stream.text += '\n\n';
      return;
    case 'text':
      if (stream) stream.text += event.text;
      break;
    case 'tool':
      if (stream) stream.tools.push({ id: event.id, name: event.name, input: event.input, done: false });
      break;
    case 'toolDone': {
      const tool = stream && stream.tools.find((t) => t.id === event.id);
      if (tool) Object.assign(tool, { done: true, ok: event.ok });
      break;
    }
    case 'notice':
      if (stream) stream.notice = event.message;
      break;
    case 'error':
    case 'aborted':
    case 'done':
      live.delete(convId);
      if (event.type === 'error') toast(event.message);
      if (convId === currentId) {
        if ((event.type === 'error' || event.type === 'aborted') && !$('input').value) {
          $('input').value = pendingText;
          autosize();
        }
        conv = await api.conversations.get(convId);
        if (!conv) currentId = null;
        if (view === 'chat') renderChat();
      }
      renderSidebar();
      return;
  }
  if (convId === currentId) updateLive();
});

// ============================================================ settings

const SECTIONS = [
  { id: 'keys', title: 'Клавиатура и вызов', icon: 'keyboard', tile: 'var(--accent)' },
  { id: 'sense', title: 'Что видит Орбита', icon: 'eye', tile: '#1e7cf2' },
  { id: 'model', title: 'Модель и ключ', icon: 'key', tile: '#248a3d' },
  { id: 'memory', title: 'Память', icon: 'bookmark', tile: '#8944ab' },
  { id: 'look', title: 'Оформление и запуск', icon: 'palette', tile: '#8e8e93' },
];

const ACCENTS = [
  ['#0071E3', 'Синий'],
  ['#7D3CC8', 'Фиолетовый'],
  ['#1A7F37', 'Зелёный'],
  ['#C2410C', 'Оранжевый'],
  ['#3A3A3C', 'Графит'],
];

const SHORTCUTS = [
  ['panel', 'Быстрый вызов', 'Панель поверх любого окна с подсказками по контексту'],
  ['window', 'Открыть основное окно', 'Чат с историей разговоров'],
  ['selection', 'Спросить о выделенном', 'Копирует выделенный текст и открывает панель'],
];

function showSettings(section) {
  view = 'settings';
  if (section) settingsSection = section;
  $('app').classList.add('settings-mode');
  $('settingsView').hidden = false;
  $('sideChat').hidden = true;
  $('sideSettings').hidden = false;
  $('settingsLink').hidden = true;
  renderSettings();
  document.getElementById(`sec-${settingsSection}`)?.scrollIntoView({ block: 'start' });
}

function renderSettingsNav() {
  $('settingsNav').replaceChildren(
    ...SECTIONS.map((s) =>
      h(
        'button',
        {
          'aria-current': String(s.id === settingsSection),
          onclick: () => {
            settingsSection = s.id;
            renderSettingsNav();
            document.getElementById(`sec-${s.id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
          },
        },
        h('span', { class: 'tile', style: `background:${s.tile}`, html: icon(s.icon) }),
        s.title,
      ),
    ),
  );
}

function section(id, title, rows, footnote) {
  return h(
    'section',
    { id: `sec-${id}` },
    h('h2', {}, title),
    h('div', { class: 'group-card' }, rows),
    footnote ? h('p', { class: 'footnote' }, footnote) : null,
  );
}

function row(label, sub, control) {
  return h('div', { class: 'setting' }, h('span', { class: 'label' }, label, sub ? h('small', {}, sub) : null), control);
}

function toggle(key, value, label) {
  return h('button', {
    class: 'switch',
    role: 'switch',
    'aria-checked': String(Boolean(value)),
    'aria-label': label,
    onclick: () => api.settings.set(key, !value),
  });
}

function shortcutButton(name, label) {
  const accel = state.settings.shortcuts[name];
  const btn = h('button', { class: 'shortcut', 'aria-label': `Изменить сочетание: ${label}` }, kbdGroup(accel));
  btn.addEventListener('click', () => {
    btn.classList.add('recording');
    btn.replaceChildren('Нажмите сочетание…');
    const onKey = async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') return stop();
      const next = acceleratorFromEvent(event);
      if (!next) return;
      stop();
      const res = await api.settings.set(`shortcuts.${name}`, next);
      if (!res.ok) toast(res.error);
    };
    const stop = () => {
      window.removeEventListener('keydown', onKey, true);
      btn.removeEventListener('blur', stop);
      btn.classList.remove('recording');
      btn.replaceChildren(kbdGroup(state.settings.shortcuts[name]));
    };
    window.addEventListener('keydown', onKey, true);
    btn.addEventListener('blur', stop);
  });
  return btn;
}

function renderSettings() {
  renderSettingsNav();
  const s = state.settings;
  const inner = $('settingsInner');
  inner.replaceChildren(h('h1', {}, 'Настройки'));

  inner.append(
    section(
      'keys',
      'Клавиатура и вызов',
      SHORTCUTS.map(([name, label, sub]) => row(label, sub, shortcutButton(name, label))),
      s.dnd ? 'Горячие клавиши сейчас на паузе — режим «Не беспокоить» включён в меню Орбиты.' : 'Нажмите на сочетание, чтобы изменить его. Esc — отмена.',
    ),
  );

  const folderRows = s.folders.map((folder) =>
    row(
      h('span', { class: 'path', title: folder }, folder),
      null,
      h('button', { class: 'icon-btn remove-btn', 'aria-label': `Убрать папку ${folder}`, html: icon('close'), onclick: () => api.settings.removeFolder(folder) }),
    ),
  );
  folderRows.push(row('Добавить папку для поиска', null, h('button', { class: 'btn', onclick: () => api.settings.addFolder() }, 'Выбрать…')));

  inner.append(
    section('sense', 'Что видит Орбита', [
      row('Активное окно', 'Название приложения и открытый документ', toggle('sense.activeWindow', s.sense.activeWindow, 'Активное окно')),
      row('Буфер обмена', 'Читается только в момент вызова панели', toggle('sense.clipboard', s.sense.clipboard, 'Буфер обмена')),
    ]),
    h('section', {}, h('h2', {}, 'Папки, где Орбита ищет и читает файлы'), h('div', { class: 'group-card' }, folderRows)),
  );

  const keyInput = h('input', {
    class: 'text-input',
    type: 'password',
    autocomplete: 'off',
    spellcheck: 'false',
    placeholder: s.hasApiKey ? 'Сохранён · новый ключ' : s.keyFromEnv ? 'Используется ANTHROPIC_API_KEY' : 'sk-ant-…',
    'aria-label': 'API-ключ Anthropic',
  });
  const saveKey = async () => {
    if (!keyInput.value.trim()) return;
    await api.settings.setApiKey(keyInput.value);
    keyInput.value = '';
    toast('Ключ сохранён');
  };
  keyInput.addEventListener('keydown', (e) => e.key === 'Enter' && saveKey());

  const models = [
    ['claude-opus-5-5', 'Opus 5.5', 'точнее'],
    ['claude-sonnet-5-5', 'Sonnet 5.5', 'быстрее'],
  ];
  inner.append(
    section(
      'model',
      'Модель и ключ',
      [
        row(
          'Модель',
          models.find(([id]) => id === s.model)?.[2] === 'точнее' ? 'Самая способная модель Claude' : 'Быстрее и дешевле',
          h('div', { class: 'segmented', role: 'group', 'aria-label': 'Модель' }, models.map(([id, label]) => h('button', { 'aria-pressed': String(s.model === id), onclick: () => api.settings.set('model', id) }, label))),
        ),
        row(
          'API-ключ Anthropic',
          null,
          h('span', { style: 'display:flex;gap:8px;flex:1.4;min-width:0' }, keyInput, h('button', { class: 'btn primary', onclick: saveKey }, 'Сохранить'), s.hasApiKey ? h('button', { class: 'btn danger', onclick: () => api.settings.setApiKey('') }, 'Удалить') : null),
        ),
      ],
      s.keyEncrypted
        ? 'Ключ шифруется средствами операционной системы и хранится только на этом компьютере. Запросы отправляются напрямую в Anthropic API.'
        : 'Шифрование системы недоступно — ключ хранится в файле настроек на этом компьютере. Запросы отправляются напрямую в Anthropic API.',
    ),
  );

  const memInput = h('input', { class: 'text-input', type: 'text', placeholder: 'Например: «Отвечай по-деловому, без эмодзи»', 'aria-label': 'Новый факт для памяти' });
  const addMemory = async () => {
    const text = memInput.value.trim();
    if (!text) return;
    await api.memory.add(text);
    memInput.value = '';
  };
  memInput.addEventListener('keydown', (e) => e.key === 'Enter' && addMemory());
  const memRows = state.memory.map((m) =>
    row(m.text, null, h('button', { class: 'icon-btn remove-btn', 'aria-label': `Забыть: ${m.text}`, html: icon('close'), onclick: () => api.memory.remove(m.id) })),
  );
  memRows.push(h('div', { class: 'setting' }, memInput, h('button', { class: 'btn', onclick: addMemory }, 'Добавить')));
  inner.append(section('memory', 'Память', memRows, 'Орбита учитывает эти факты в каждом разговоре. Она добавляет их сама, когда вы просите что-то запомнить.'));

  inner.append(
    section('look', 'Оформление и запуск', [
      row(
        'Цвет акцента',
        null,
        h('div', { class: 'swatches' }, ACCENTS.map(([color, name]) => h('button', { class: 'swatch', style: `background:${color}`, 'aria-label': name, 'aria-pressed': String(s.accent.toLowerCase() === color.toLowerCase()), onclick: () => api.settings.set('accent', color) }))),
      ),
      row('Открывать при входе в систему', null, toggle('launchAtLogin', s.launchAtLogin, 'Открывать при входе в систему')),
    ]),
  );
}

// ============================================================ state & navigation

function applyState(next) {
  const first = !state;
  state = next;
  applyAccent(state.settings.accent);
  if (first) return;
  renderSidebar();
  if (view === 'settings') {
    const scroll = $('settingsView').scrollTop;
    renderSettings();
    $('settingsView').scrollTop = scroll;
  } else {
    renderInfo();
    renderComposer();
  }
}

let queuedNav = null;

function navigate(nav) {
  if (nav && nav.view === 'settings') showSettings(nav.section);
  else if (nav && nav.convId) openConversation(nav.convId);
  else showChat();
}

api.onState(applyState);
api.app.onNavigate((nav) => {
  if (state) navigate(nav);
  else queuedNav = nav; // arrived before the first state load
});

api.getState().then((s) => {
  applyState(s);
  const last = s.conversations[0];
  if (queuedNav) navigate(queuedNav);
  else if (last) openConversation(last.id);
  else newChat();
});
