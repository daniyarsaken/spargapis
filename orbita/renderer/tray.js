import { api, h, icon, kbdGroup, keyLabels, applyAccent, relTime } from './ui.js';

const $ = (id) => document.getElementById(id);

const TOGGLES = [
  ['windowTile', 'sense.activeWindow', 'window', 'Активное окно', (s) => s.sense.activeWindow],
  ['clipboardTile', 'sense.clipboard', 'clipboard', 'Буфер обмена', (s) => s.sense.clipboard],
  ['dndTile', 'dnd', 'moon', 'Не беспокоить', (s) => s.dnd, 'Клавиши на паузе', 'Выкл.'],
  ['loginTile', 'launchAtLogin', 'power', 'При входе', (s) => s.launchAtLogin, 'Запускать', 'Не запускать'],
];

function render(state) {
  const s = state.settings;
  applyAccent(s.accent);

  $('askHint').textContent = s.dnd ? 'Горячие клавиши на паузе' : `${keyLabels(s.shortcuts.panel).join(' ')} в любом окне`;

  for (const [id, key, iconName, title, get, onText = 'Вкл.', offText = 'Выкл.'] of TOGGLES) {
    const on = Boolean(get(s));
    const tile = $(id);
    tile.setAttribute('aria-checked', String(on));
    tile.replaceChildren(
      h('span', { class: 'bubble-icon', html: icon(iconName) }),
      h('span', { class: 'tile-text' }, h('strong', {}, title), h('small', {}, on ? onText : offText)),
    );
    tile.onclick = () => api.settings.set(key, !on);
  }

  const recent = $('recent');
  recent.replaceChildren();
  const convs = state.conversations.slice(0, 4);
  if (!convs.length) recent.append(h('div', { class: 'empty-note' }, 'Разговоров пока нет'));
  for (const c of convs) {
    recent.append(
      h(
        'button',
        { class: 'recent-item', onclick: () => api.app.open({ convId: c.id }) },
        h('span', { class: 'ico', html: icon('chat') }),
        h('span', { class: 'txt' }, h('span', {}, c.title), h('small', {}, relTime(c.updatedAt))),
      ),
    );
  }

  $('openKeys').replaceChildren(kbdGroup(s.shortcuts.window));
}

$('askTile').addEventListener('click', () => api.panel.show());
$('openApp').addEventListener('click', () => api.app.open());
$('openSettings').addEventListener('click', () => api.app.open({ view: 'settings' }));
$('quit').addEventListener('click', () => api.app.quit());
document.addEventListener('keydown', (e) => e.key === 'Escape' && api.tray.hide());

api.onState(render);
api.getState().then(render);
