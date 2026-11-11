import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, 'browser-artifacts', 'expedition-log');
await mkdir(artifacts, { recursive: true });
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const relative =
      pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
    const file = path.resolve(root, relative);
    const allowed =
      ['index.html', 'style.css'].includes(relative) ||
      (relative.startsWith('src/') &&
        file.startsWith(path.join(root, 'src') + path.sep));
    if (!allowed) {
      res.writeHead(404);
      res.end();
      return;
    }
    const data = await readFile(file);
    const type =
      { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' }[
        path.extname(file)
      ] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

let browser;
try {
  browser = await chromium.launch({ headless: true });
  for (const width of [320, 375, 768]) {
    const context = await browser.newContext({
        viewport: { width, height: 800 },
      }),
      page = await context.newPage(),
      errors = [];
    page.setDefaultTimeout(10000);
    page.on('pageerror', (e) => errors.push(e.message));
    await context.tracing.start({ screenshots: true, snapshots: true });
    const control = (a) => page.locator(`#app [data-action="${a}"]`).first();
    const snap = () =>
      page.evaluate(() => ({
        state: structuredClone(window.game.state),
        quick: localStorage.getItem('nothaven-save'),
      }));
    const toggle = page.locator('#app [data-action="toggleExpeditionLog"]');
    try {
      await page.goto(base);
      await control('newGame').click();
      await control('explore').click();
      assert.equal(await toggle.count(), 0);
      for (let n = 0; n < 4; n++) {
        await control('moveEast').click();
        await control('waitTurn').click();
        await control('moveWest').click();
        await control('waitTurn').click();
      }
      await control('waitTurn').click();
      const surveyed = await snap();
      assert.equal(surveyed.state.map.zoneId, 'greyhaven');
      assert.equal(surveyed.state.map.x, 2);
      assert.equal(surveyed.state.map.y, 3);
      assert.equal(surveyed.state.map.steps, 8);
      assert.equal(surveyed.state.map.log.length, 10);
      assert.equal(
        surveyed.state.map.log.at(-1),
        surveyed.state.map.log.at(-2),
      );
      await control('save').click();
      const before = await snap();
      assert.notEqual(before.quick, null);
      assert.equal(before.state.map.log.length, 11);
      assert.equal(before.state.map.log.at(-1), 'Game saved.');
      const groups = [];
      for (const text of before.state.map.log) {
        if (typeof text !== 'string' || !text.length) continue;
        const last = groups.at(-1);
        if (last?.text === text) last.count++;
        else groups.push({ text, count: 1 });
      }
      assert.equal(groups.length, 10);
      assert.equal(
        groups.reduce((n, g) => n + g.count - 1, 0),
        1,
      );
      const full = groups
        .reverse()
        .map((g) => g.text + (g.count > 1 ? ` (×${g.count})` : ''));
      const verify = async (expanded, focus = false) => {
        assert.equal(await page.locator('#expedition-log-entries').count(), 1);
        assert.equal(
          await page.locator('.expedition-log__summary').textContent(),
          expanded
            ? 'Steps taken: 8 · Regions visited: 1/9 · Showing 10 recent entries (1 repeat collapsed)'
            : 'Steps taken: 8 · Regions visited: 1/9 · Showing 6 recent entries (1 repeat collapsed)',
        );
        assert.equal(await toggle.count(), 1);
        assert.equal(
          await toggle.getAttribute('aria-controls'),
          'expedition-log-entries',
        );
        assert.equal(
          await toggle.getAttribute('aria-expanded'),
          String(expanded),
        );
        assert.equal(
          (await toggle.textContent()).trim(),
          expanded ? 'Show recent entries only' : 'Show earlier entries (4)',
        );
        assert.deepEqual(
          await page.locator('#expedition-log-entries > p').allTextContents(),
          expanded ? full : full.slice(0, 6),
        );
        assert.deepEqual(await snap(), before);
        if (focus)
          assert.equal(
            await toggle.evaluate((n) => n === document.activeElement),
            true,
          );
      };
      for (const scale of ['115', '130']) {
        await page.locator('[aria-controls="display-settings"]').click();
        assert.deepEqual(await snap(), before);
        await page.locator('[data-display-scale]').selectOption(scale);
        assert.deepEqual(await snap(), before);
        await page.locator('[data-display-done]').click();
        assert.deepEqual(await snap(), before);
        await verify(false);
        await toggle.click();
        await verify(true, true);
        await page.keyboard.press('Enter');
        await verify(false, true);
        await page.keyboard.press('Enter');
        await verify(true, true);
        await toggle.scrollIntoViewIfNeeded();
        await page.mouse.move(0, 0);
        await page.waitForTimeout(250);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth),
          width,
        );
        assert.ok(
          await toggle.evaluate((n) => {
            const b = n.getBoundingClientRect();
            return b.height >= 44 && b.left >= 0 && b.right <= innerWidth + 1;
          }),
        );
        for (const selector of [
          '.expedition-log__toggle > span',
          '.expedition-log__summary',
          '#expedition-log-entries > p',
        ]) {
          const fits = await page.locator(selector).evaluateAll((ns) =>
            ns.map((n) => {
              const b = n.getBoundingClientRect(),
                r = document.createRange();
              r.selectNodeContents(n);
              return (
                b.left >= 0 &&
                b.right <= innerWidth + 1 &&
                [...r.getClientRects()].every(
                  (g) => g.left >= b.left - 1 && g.right <= b.right + 1,
                )
              );
            }),
          );
          assert.ok(
            fits.length > 0 && fits.every(Boolean),
            `${width}/${scale} ${selector} horizontal glyph containment`,
          );
        }
        await verify(true, true);
        await page.screenshot({
          path: `${artifacts}/${width}-expanded-${scale}.png`,
          fullPage: true,
        });
        await page.screenshot({
          path: `${artifacts}/${width}-expanded-${scale}-viewport.png`,
        });
        await page.keyboard.press('Enter');
        await verify(false, true);
      }
      await toggle.click();
      await verify(true, true);
      await control('toTownScene').click();
      const town = structuredClone(before);
      town.state.scene = 'town';
      assert.deepEqual(await snap(), town);
      await control('explore').click();
      await verify(false);
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${width}: fresh Home eight steps/eight surveys plus one repeat and native Save; 10 grouped entries, 6 recent/4 older; native toggle/Enter focus/aria-controls-expanded, 115/130 horizontal glyph fit and44px, whole journey/raw quick stable, Town/Explore reset; errors []`,
      );
    } catch (e) {
      await page
        .screenshot({
          path: `${artifacts}/${width}-failure.png`,
          fullPage: true,
        })
        .catch(() => {});
      throw e;
    } finally {
      try {
        await context.tracing.stop({ path: `${artifacts}/${width}.zip` });
      } finally {
        await context.close();
      }
    }
  }
} finally {
  try {
    if (browser) await browser.close();
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
