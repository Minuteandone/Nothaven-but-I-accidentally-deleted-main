import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const artifacts = path.join(root, 'browser-artifacts');
await mkdir(artifacts, { recursive: true });
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
    const file = path.resolve(root, relative);
    const allowed = ['index.html', 'style.css'].includes(relative)
      || (relative.startsWith('src/') && file.startsWith(path.join(root, 'src') + path.sep));
    if (!allowed) { res.writeHead(404); res.end(); return; }
    const data = await readFile(file);
    const type = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' }[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type }); res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
// Synthetic renderer/layout coverage, not earned gameplay or a screen-reader test.
let browser;
let renders = 0;
try {
  browser = await chromium.launch();
  for (const width of [320, 375, 768]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base);
    const before = await page.evaluate(() => JSON.stringify(game.state));
    const quickBefore = await page.evaluate(() => localStorage.getItem('nothaven-save'));
    for (const scale of ['100', '115', '130']) for (const shortcuts of [true, false]) {
      await page.locator('[aria-controls="display-settings"]').click();
      await page.locator('[data-display-scale]').selectOption(scale);
      await page.locator('[data-display-shortcuts]').setChecked(shortcuts);
      await page.locator('[data-display-done]').click();
      for (const menu of ['items', 'skills']) {
        const result = await page.evaluate(async menu => {
          const { renderCombat } = await import('/src/ui/combat.js');
          const { createCombat } = await import('/src/combat/rules.js');
          const { createInitialState } = await import('/src/state.js');
          const { ITEMS, TYPES } = await import('/src/items/items.js');
          const hero = { ...createInitialState().party[0], level: 20, hp: 10, mp: 100 };
          const input = { combat: createCombat({ enemyId: 'storm_heart' }), party: [hero],
            inventory: Object.values(ITEMS).filter(i => i.type === TYPES.CONSUMABLE).map(i => ({ id: i.id, qty: 2 })), menu };
          const old = JSON.stringify(input);
          const freeze = x => { if (x && typeof x === 'object') { Object.values(x).forEach(freeze); Object.freeze(x); } return x; };
          document.querySelector('#app').innerHTML = renderCombat(freeze(input));
          const cards = [...document.querySelectorAll('.command-card')].map(card => {
            const title = card.querySelector('.command-card__top > span:first-child');
            const words = [];
            const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
              const node = walker.currentNode;
              for (const match of node.textContent.matchAll(/\S+/g)) {
                const r = document.createRange(); r.setStart(node, match.index); r.setEnd(node, match.index + match[0].length);
                const rects = [...r.getClientRects()].filter(r => r.width > 0 && r.height > 0);
                words.push({ text: match[0], lines: new Set(rects.map(r => Math.round(r.top))).size });
              }
            }
            const r = card.getBoundingClientRect(), range = document.createRange(); range.selectNodeContents(card);
            return { name: title.textContent.trim(), height: r.height, left: r.left, right: r.right, words,
              glyphs: [...range.getClientRects()].map(r => ({ left: r.left, right: r.right })) };
          });
          return { unchanged: old === JSON.stringify(input), width: document.documentElement.scrollWidth, cards };
        }, menu);
        const context = `${width}/${scale}/${shortcuts}/${menu}`;
        assert.ok(result.unchanged, context);
        assert.ok(result.width <= width + 1, context);
        assert.equal(result.cards.length, menu === 'items' ? 11 : 15, context);
        for (const card of result.cards) {
          assert.ok(card.height >= 44 && card.left >= -1 && card.right <= width + 1, `${context}: ${card.name}`);
          for (const word of card.words) assert.equal(word.lines, 1, `${context}: title word ${word.text} must not split`);
          for (const glyph of card.glyphs) assert.ok(glyph.left >= -1 && glyph.right <= width + 1, `${context}: glyph overflow`);
        }
        assert.equal(await page.evaluate(() => JSON.stringify(game.state)), before);
        assert.equal(await page.evaluate(() => localStorage.getItem('nothaven-save')), quickBefore);
        if (width === 320 && scale === '130' && shortcuts && menu === 'items')
          await page.locator('[data-action="item"][data-arg="bandage"]').screenshot({ path: path.join(artifacts, 'card-title-bandage-320-130.png') });
        renders++;
      }
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(JSON.stringify({ pass: true, syntheticRenders: renders, widths: [320, 375, 768], scales: [100, 115, 130] }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
