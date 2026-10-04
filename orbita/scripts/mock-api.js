'use strict';

// A tiny stand-in for the Messages API used by the smoke test. It streams
// server-sent events in the same shape as the real API: the first turn asks
// for the search_files tool, the turn after a tool result answers in text.

const http = require('http');

function sse(res, events) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  for (const event of events) res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  res.end();
}

function message(id, blocks, stopReason) {
  const events = [
    {
      type: 'message_start',
      message: { id, type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 42, output_tokens: 1 } },
    },
  ];
  blocks.forEach((block, index) => {
    if (block.type === 'text') {
      events.push({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } });
      // split into small deltas to exercise streaming
      for (let i = 0; i < block.text.length; i += 24) {
        events.push({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: block.text.slice(i, i + 24) } });
      }
    } else {
      events.push({ type: 'content_block_start', index, content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} } });
      events.push({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) } });
    }
    events.push({ type: 'content_block_stop', index });
  });
  events.push({ type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 120 } });
  events.push({ type: 'message_stop' });
  return events;
}

const ANSWER = `Условия заметно различаются по оплате и выходу из договора. Самый рискованный — **«Гамма»**: в нём нет права расторгнуть договор в одностороннем порядке.

| Условие | Альфа | Бета | Гамма |
|---|---|---|---|
| Оплата | Поэтапно | Поэтапно | Полная предоплата |
| Неустойка | Взаимная | Только для нас | Не указана |
| Расторжение | С уведомлением | С уведомлением | Только по суду |

Что предлагаю:
1. Попросить «Гамму» добавить пункт о расторжении с уведомлением.
2. Согласовать с юристом неустойку в «Бете».`;

const SUMMARY = `- **Рост держится на новом тарифе**, остальные продукты на уровне прошлого квартала.
- **Расходы на поддержку выросли** — авторы предлагают базу знаний.
- **Решение до конца месяца:** запускать второй регион сейчас или позже.`;

function start() {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const json = JSON.parse(body || '{}');
      requests.push({ url: req.url, headers: req.headers, body: json });
      const last = json.messages[json.messages.length - 1];
      const hasToolResult = Array.isArray(last.content) && last.content.some((b) => b.type === 'tool_result');
      const text = JSON.stringify(last.content);
      const n = requests.length;
      if (hasToolResult) return sse(res, message(`msg_${n}`, [{ type: 'text', text: ANSWER }], 'end_turn'));
      if (/договор/i.test(text)) {
        return sse(res, message(`msg_${n}`, [{ type: 'text', text: 'Сейчас найду договоры.' }, { type: 'tool_use', id: `toolu_${n}`, name: 'search_files', input: { query: 'договор' } }], 'tool_use'));
      }
      return sse(res, message(`msg_${n}`, [{ type: 'text', text: SUMMARY }], 'end_turn'));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}`, requests, close: () => server.close() }));
  });
}

module.exports = { start };
