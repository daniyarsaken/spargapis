import { api, h, icon, isMac, mod, toast, words, wordCount, applyAccent, describeToolRunning } from './ui.js';
import { renderMarkdown } from './markdown.js';

const $ = (id) => document.getElementById(id);
const q = $('q');
const list = $('list');

let state = null; // app state from the main process
let ctx = { app: '', window: '', clipboard: '', selection: '' };
let items = [];
let selected = 0;

// the current answer
let convId = null;
let answerText = '';
let streaming = false;
let lastRequest = null;
let renderQueued = false;

// ------------------------------------------------------------ actions

const TEXT_ACTIONS = [
  {
    id: 'summarize',
    icon: 'list',
    tile: 'var(--accent)',
    title: 'Кратко пересказать',
    prompt: 'Кратко перескажи этот текст: главное в 3–5 пунктах.',
  },
  {
    id: 'translate',
    icon: 'globe',
    tile: '#5856d6',
    title: 'Перевести',
    sub: 'Русский ↔ английский',
    prompt: 'Переведи этот текст: с русского на английский, с любого другого языка — на русский. Сохрани форматирование. Выведи только перевод.',
  },
  {
    id: 'improve',
    icon: 'wand',
    tile: '#c2410c',
    title: 'Исправить и улучшить',
    sub: 'Ошибки, ясность, тон — смысл не меняется',
    prompt: 'Исправь ошибки и сделай этот текст яснее, сохранив смысл, язык и тон. Выведи только исправленный текст.',
  },
  {
    id: 'reply',
    icon: 'reply',
    tile: '#1e7cf2',
    title: 'Набросать ответ',
    sub: 'Вежливый ответ на это сообщение',
    prompt: 'Набросай вежливый и конкретный ответ на это сообщение на его языке. Выведи только текст ответа.',
  },
];

function sourceText() {
  return ctx.selection || ctx.clipboard || '';
}

function sourceLabel() {
  if (ctx.selection) return 'Выделенный текст';
  if (ctx.clipboard) return 'Буфер обмена';
  return '';
}

function buildItems(query) {
  const text = sourceText();
  const where = [sourceLabel(), ctx.app].filter(Boolean).join(' · ');
  const result = [];

  if (query) {
    result.push({ id: 'ask', icon: 'search', tile: 'var(--accent)', title: `Спросить: «${query}»`, sub: text ? 'С учётом выделенного или скопированного текста' : 'Ответ прямо здесь', run: () => ask(query, query, { includeText: true }) });
    result.push({ id: 'ask-chat', icon: 'chat', tile: '#8e8e93', title: 'Спросить в окне чата', sub: 'Длинный разговор с историей', key: `${mod}↩`, run: () => askInChat(query) });
    return result;
  }

  if (text) {
    for (const action of TEXT_ACTIONS) {
      result.push({ ...action, sub: action.sub || where, run: () => ask(action.title, action.prompt, { includeText: true, source: where }) });
    }
  }
  result.push({ id: 'files', icon: 'folder', tile: '#1e7cf2', title: 'Найти в моих файлах', sub: 'Документы, Загрузки, Рабочий стол', run: () => fill('Найди в моих файлах ') });
  const recent = state && state.conversations[0];
  if (recent) {
    result.push({ id: 'recent', icon: 'chat', tile: '#8e8e93', title: 'Продолжить разговор', sub: recent.title, run: () => api.app.open({ convId: recent.id }) });
  }
  return result.map((item, i) => ({ ...item, key: item.key || (i < 9 ? `${mod}${i + 1}` : '') }));
}

function renderList() {
  items = buildItems(q.value.trim());
  selected = Math.min(selected, items.length - 1);
  list.replaceChildren();
  if (!q.value.trim()) list.append(h('div', { class: 'list-title' }, 'Предложения'));
  items.forEach((item, i) => {
    const row = h(
      'button',
      { class: 'item', role: 'option', 'aria-selected': String(i === selected), onclick: () => item.run(), onmousemove: (e) => pointerMoved(e) && select(i) },
      h('span', { class: 'tile', style: `background:${item.tile}`, html: icon(item.icon) }),
      h('span', { class: 'text' }, h('span', { class: 'title' }, item.title), item.sub ? h('span', { class: 'sub' }, item.sub) : null),
      i === selected ? h('span', { class: 'key' }, '↩') : item.key ? h('kbd', {}, item.key) : null,
    );
    row.tabIndex = -1;
    list.append(row);
  });
}

let lastPointer = null;
function pointerMoved(event) {
  const moved = lastPointer && (lastPointer.x !== event.screenX || lastPointer.y !== event.screenY);
  lastPointer = { x: event.screenX, y: event.screenY };
  return moved;
}

function select(i) {
  if (i === selected) return;
  selected = i;
  renderList();
}

function renderChips() {
  const chips = $('chips');
  chips.replaceChildren();
  if (ctx.app || ctx.window) {
    chips.append(h('span', { class: 'chip', title: [ctx.app, ctx.window].filter(Boolean).join(' — ') }, h('span', { html: icon('window', 'sm') }), h('span', {}, ctx.window || ctx.app)));
  }
  const text = sourceText();
  if (text) {
    chips.append(h('span', { class: 'chip' }, h('span', { html: icon('clipboard', 'sm') }), h('span', {}, `${sourceLabel()} · ${words(wordCount(text))}`)));
  }
}

function fill(text) {
  q.value = text;
  q.focus();
  renderList();
}

// ------------------------------------------------------------ asking

function contextFor(includeText) {
  const c = {};
  if (ctx.app || ctx.window) Object.assign(c, { app: ctx.app, window: ctx.window });
  if (includeText) {
    if (ctx.selection) c.selection = ctx.selection;
    else if (ctx.clipboard) c.clipboard = ctx.clipboard;
  }
  return c;
}

async function ask(label, prompt, { includeText = false, source = '' } = {}) {
  convId = await api.chat.newId();
  lastRequest = { label, prompt, includeText, source };
  showAnswer(label, source);
  await send({ convId, scope: 'panel', text: prompt, context: contextFor(includeText) });
}

async function refine(text) {
  if (!convId || streaming) return;
  $('answerQuery').textContent = text;
  $('answerSource').textContent = '';
  await send({ convId, scope: 'panel', text });
}

async function send(payload) {
  answerText = '';
  streaming = true;
  $('answerBody').replaceChildren();
  setStatus('typing');
  setActionsEnabled(false);
  const result = await api.chat.send(payload);
  if (result && result.error) {
    streaming = false;
    setStatus('error', result.error);
  }
}

async function askInChat(text) {
  const id = await api.chat.newId();
  const result = await api.chat.send({ convId: id, scope: 'app', text, context: contextFor(true) });
  if (result && result.error) return toast(result.error);
  api.app.open({ convId: id });
  api.panel.hide();
}

// ------------------------------------------------------------ answer view

function showAnswer(label, source) {
  $('searchRow').hidden = true;
  $('home').hidden = true;
  $('answerHead').hidden = false;
  $('answer').hidden = false;
  $('answerQuery').textContent = label;
  $('answerSource').textContent = source ? `Из: ${source}` : '';
  $('refine').value = '';
  renderFooter();
}

function showHome() {
  if (streaming && convId) api.chat.stop(convId);
  streaming = false;
  convId = null;
  $('answerHead').hidden = true;
  $('answer').hidden = true;
  $('searchRow').hidden = false;
  $('home').hidden = false;
  q.focus();
  q.select();
  renderList();
  renderFooter();
}

function setStatus(kind, text = '') {
  const el = $('answerStatus');
  el.className = 'status';
  el.replaceChildren();
  if (!kind) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  if (kind === 'typing') el.append(h('span', { class: 'typing', 'aria-label': 'Орбита пишет' }, h('span'), h('span'), h('span')));
  else el.classList.add(kind);
  if (text) el.append(h('span', {}, text));
}

function setActionsEnabled(enabled) {
  $('actions').dataset.disabled = String(!enabled);
}

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    $('answerBody').innerHTML = renderMarkdown(answerText);
    const scroll = $('answerScroll');
    if (scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 80) scroll.scrollTop = scroll.scrollHeight;
  });
}

api.chat.onEvent((event) => {
  if (event.convId !== convId) return;
  switch (event.type) {
    case 'textStart':
      if (answerText && !answerText.endsWith('\n\n')) answerText += '\n\n';
      break;
    case 'text':
      answerText += event.text;
      setStatus(null);
      scheduleRender();
      break;
    case 'tool':
      setStatus('typing', describeToolRunning(event.name, event.input));
      break;
    case 'notice':
      setStatus('notice', event.message);
      break;
    case 'error':
      streaming = false;
      setStatus('error', event.message);
      break;
    case 'aborted':
    case 'done':
      streaming = false;
      if ($('answerStatus').querySelector('.typing')) setStatus(null);
      setActionsEnabled(Boolean(answerText.trim()));
      scheduleRender();
      break;
  }
});

// ------------------------------------------------------------ buttons

$('backBtn').innerHTML = icon('close');
$('retryBtn').innerHTML = icon('refresh', 'sm');
$('refineBtn').innerHTML = icon('send', 'sm');
$('lockIcon').innerHTML = icon('lock', 'xs');
$('backBtn').addEventListener('click', showHome);

$('insertBtn').addEventListener('click', insert);
$('copyBtn').addEventListener('click', async () => {
  await api.panel.copy(answerText.trim());
  toast('Скопировано');
});
$('chatBtn').addEventListener('click', () => api.panel.openInChat(convId));
$('retryBtn').addEventListener('click', () => {
  if (lastRequest) ask(lastRequest.label, lastRequest.prompt, lastRequest);
});
$('refineForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const text = $('refine').value.trim();
  if (text) {
    $('refine').value = '';
    refine(text);
  }
});

async function insert() {
  if (!answerText.trim() || streaming) return;
  const pasted = await api.panel.insert(answerText.trim());
  if (!pasted) toast(`Скопировано — вставьте ${isMac ? '⌘V' : 'Ctrl+V'}`);
}

function renderFooter() {
  const keys = $('footKeys');
  const answerMode = !$('answer').hidden;
  const pairs = answerMode
    ? [[`${mod}↩`, 'Вставить'], ['esc', 'Назад']]
    : [['↑↓', 'Выбор'], [`${mod}↩`, 'В чат'], ['esc', 'Закрыть']];
  keys.replaceChildren(...pairs.map(([k, label]) => h('span', {}, h('kbd', {}, k), label)));
  $('insertHint').textContent = `${mod}↩`;
}

// ------------------------------------------------------------ keyboard

q.addEventListener('input', () => {
  selected = 0;
  renderList();
});

document.addEventListener('keydown', (event) => {
  const cmd = isMac ? event.metaKey : event.ctrlKey;
  const answerMode = !$('answer').hidden;

  if (event.key === 'Escape') {
    event.preventDefault();
    if (answerMode && streaming) api.chat.stop(convId);
    else if (answerMode) showHome();
    else if (q.value) fill('');
    else api.panel.hide();
    return;
  }

  if (answerMode) {
    if (cmd && event.key === 'Enter') {
      event.preventDefault();
      insert();
    } else if (cmd && event.key.toLowerCase() === 'c' && !window.getSelection().toString()) {
      event.preventDefault();
      $('copyBtn').click();
    }
    return;
  }

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const n = items.length;
    select((selected + (event.key === 'ArrowDown' ? 1 : n - 1)) % n);
    list.querySelectorAll('.item')[selected]?.scrollIntoView({ block: 'nearest' });
  } else if (event.key === 'Enter') {
    event.preventDefault();
    const query = q.value.trim();
    if (cmd && query) askInChat(query);
    else if (cmd) api.app.open();
    else items[selected]?.run();
  } else if (cmd && /^[1-9]$/.test(event.key)) {
    const item = items[Number(event.key) - 1];
    if (item) {
      event.preventDefault();
      item.run();
    }
  }
});

// ------------------------------------------------------------ lifecycle

api.panel.onShow((context) => {
  ctx = context || ctx;
  selected = 0;
  lastPointer = null;
  q.value = '';
  renderChips();
  showHome();
});

function applyState(next) {
  state = next;
  applyAccent(state.settings.accent);
  if (!$('home').hidden) renderList();
}

api.onState(applyState);
api.getState().then((s) => {
  applyState(s);
  renderChips();
  renderList();
  renderFooter();
});
