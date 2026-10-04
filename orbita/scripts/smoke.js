'use strict';

// End-to-end smoke test: `npm run smoke` (needs a display; on Linux CI use xvfb-run).
// Runs the real app against a local mock of the Messages API, drives the
// panel, chat, settings and tray, saves screenshots to ./screenshots and checks
// what was sent to the API.

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { nativeTheme } = require('electron');
const mock = require('./mock-api');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = async function smoke(app) {
  const out = path.join(__dirname, '..', 'screenshots');
  fs.mkdirSync(out, { recursive: true });
  const api = await mock.start();
  process.env.ANTHROPIC_BASE_URL = api.url;

  // a folder with files for search_files
  const docs = fs.mkdtempSync(path.join(os.tmpdir(), 'orbita-docs-'));
  for (const name of ['Договор_Альфа.txt', 'Договор_Бета.txt', 'Договор_Гамма.txt']) {
    fs.writeFileSync(path.join(docs, name), `${name}: оплата, неустойка, расторжение.`);
  }
  app.store.settings.folders = [docs];
  app.store.setApiKey('sk-ant-test');
  app.assistant.resetClient();

  const shot = async (win, name) => {
    await sleep(400);
    const image = await win.webContents.capturePage();
    fs.writeFileSync(path.join(out, `${name}.png`), image.toPNG());
    console.log(`  screenshot ${name}.png`);
  };
  const waitIdle = async (id) => {
    for (let i = 0; i < 100 && app.assistant.isRunning(id); i++) await sleep(100);
    assert(!app.assistant.isRunning(id), 'reply did not finish');
  };
  const js = (win, code) => win.webContents.executeJavaScript(code);

  try {
    // 1. main window, empty state
    app.showApp();
    await new Promise((r) => (app.appWin.webContents.isLoading() ? app.appWin.webContents.once('did-finish-load', r) : r()));
    await shot(app.appWin, 'app-empty');

    // 2. chat with a tool call
    const convId = '11111111-2222-4333-8444-555555555555';
    await js(app.appWin, `document.getElementById('input').value = 'Найди договоры в Загрузках и сравни их. Что рискованнее?'; document.getElementById('input').dispatchEvent(new Event('input'));`);
    // send through the same IPC path the composer uses, with a fixed id
    app.assistant.send({ convId, scope: 'app', text: 'Найди договоры в Загрузках и сравни их. Что рискованнее?' });
    app.showApp({ convId });
    await waitIdle(convId);
    await js(app.appWin, `document.getElementById('input').value=''; document.getElementById('input').dispatchEvent(new Event('input'));`);
    await shot(app.appWin, 'app-chat');

    const conv = app.store.getConversation(convId);
    assert.strictEqual(conv.messages.length, 4, 'user, assistant(tool_use), user(tool_result), assistant');
    const toolResult = conv.messages[2].content[0];
    assert.strictEqual(toolResult.type, 'tool_result');
    assert(/Договор_Гамма\.txt/.test(toolResult.content), 'search_files found the files');
    assert(conv.files.length === 0, 'search does not add files');

    const first = api.requests[0];
    assert.strictEqual(first.url, '/v1/messages?beta=true');
    assert.strictEqual(first.body.model, 'claude-opus-5-5');
    assert.strictEqual(first.body.stream, true);
    assert.strictEqual(first.body.fallbacks, 'default');
    assert.deepStrictEqual(first.body.output_config, { effort: 'medium' });
    assert(String(first.headers['anthropic-beta']).includes('server-side-fallback-2026-07-01'));
    assert.strictEqual(first.headers['x-api-key'], 'sk-ant-test');
    assert(first.body.tools.every((t) => t.strict && t.eager_input_streaming));
    console.log('  api requests ok:', api.requests.length);

    // 3. settings
    app.showApp({ view: 'settings' });
    await shot(app.appWin, 'app-settings');

    // 4. panel: suggestions for copied text, then a quick answer
    const ctx = { app: 'Google Chrome', window: 'Отчёт за квартал.pdf', clipboard: 'Отчёт за квартал. Выручка выросла благодаря новому тарифу. '.repeat(20), selection: '' };
    app.panelWin.setBounds({ x: 100, y: 80, width: 808, height: 608 });
    app.panelWin.webContents.send('panel:show', ctx);
    app.panelWin.show();
    await shot(app.panelWin, 'panel-home');

    const before = api.requests.length;
    await js(app.panelWin, `document.querySelector('.item').click()`);
    await sleep(300);
    for (let i = 0; i < 50 && api.requests.length === before; i++) await sleep(100);
    await sleep(800);
    await shot(app.panelWin, 'panel-answer');
    const panelReq = api.requests[api.requests.length - 1].body;
    assert.deepStrictEqual(panelReq.output_config, { effort: 'low' });
    assert(/<context>[\s\S]*Буфер обмена:/.test(panelReq.messages[0].content[0].text), 'clipboard context sent');
    const answer = await js(app.panelWin, `document.getElementById('answerBody').innerText`);
    assert(/Рост держится/.test(answer), 'panel shows the answer');
    app.panelWin.hide();

    // 5. tray
    app.toggleTrayWindow({ x: 900, y: 0, width: 22, height: 22 });
    await shot(app.trayWin, 'tray');
    app.trayWin.hide();

    // 6. dark mode
    nativeTheme.themeSource = 'dark';
    app.showApp({ convId });
    await shot(app.appWin, 'app-chat-dark');
    app.panelWin.webContents.send('panel:show', ctx);
    app.panelWin.show();
    await shot(app.panelWin, 'panel-home-dark');

    console.log('SMOKE OK');
  } catch (err) {
    console.error('SMOKE FAILED:', err);
    process.exitCode = 1;
  } finally {
    api.close();
    fs.rmSync(docs, { recursive: true, force: true });
    app.quit();
  }
};
