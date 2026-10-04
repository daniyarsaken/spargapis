'use strict';

// Fast checks without a display: syntax of every source file and a few
// Markdown rendering cases. Run with `npm run check`.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const files = ['main.js', 'preload.js']
  .concat(fs.readdirSync(path.join(root, 'src')).map((f) => `src/${f}`))
  .concat(fs.readdirSync(path.join(root, 'renderer')).filter((f) => f.endsWith('.js')).map((f) => `renderer/${f}`))
  .concat(fs.readdirSync(__dirname).map((f) => `scripts/${f}`));

for (const file of files) execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'inherit' });
console.log(`syntax ok: ${files.length} files`);

(async () => {
  const { renderMarkdown } = await import(path.join(root, 'renderer', 'markdown.js'));
  const cases = [
    ['**жирный** и *курсив*', '<p><strong>жирный</strong> и <em>курсив</em></p>'],
    ['<script>alert(1)</script>', '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>'],
    ['[ссылка](https://example.com)', '<p><a href="https://example.com" target="_blank" rel="noreferrer">ссылка</a></p>'],
    ['[x](javascript:alert(1))', '<p>[x](javascript:alert(1))</p>'],
    ['- один\n- два', '<ul><li>один</li><li>два</li></ul>'],
    ['3. три\n4. четыре', '<ol start="3"><li>три</li><li>четыре</li></ol>'],
    ['## Заголовок', '<h3>Заголовок</h3>'],
    ['---', '<hr>'],
    ['`a<b`', '<p><code>a&lt;b</code></p>'],
    ['```\n<b>\n```', '<pre><code>&lt;b&gt;</code></pre>'],
  ];
  for (const [input, expected] of cases) assert.strictEqual(renderMarkdown(input), expected, input);
  const table = renderMarkdown('| A | B |\n|---|---|\n| 1 | 2 |');
  assert(table.includes('<th>A</th>') && table.includes('<td>2</td>'), 'table');
  console.log(`markdown ok: ${cases.length + 1} cases`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
