import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, 'browser-artifacts', 'guide');
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

// Literal expectations are independent of the production Guide catalogue.
const SUPPORT_SENTENCE = 'Against late bosses and field trials, trading blows alone often falls short: raise Beacon Aegis or Warding Stance before a gathered heavy blow lands, restore the party with Rallying Light or Stormhaven Vigil before health runs low, clear shock with Steady Signal, and keep Rekindle ready for a fallen companion — a party that stays standing keeps dealing damage over a long fight.';
const KNOCKOUT_SENTENCE = 'When the foe’s next blow could knock out your leader at their current health, a “Knockout risk:” line appears beneath that estimate, naming the threat and what still helps: Defend or a ward to halve it, healing before it lands, or a stun or Stillpoint Strike to break a gathered heavy blow.';
const FINISH_SENTENCE = 'Once a foe is down to half health or less, a “Finishing blow:” line names the attacks and skills you can use now whose estimate reaches its remaining health: “will defeat” when even the lowest roll is enough, or “could defeat … on a high roll” when only the top of the range is.';
const rows = [
  ['Exploring', 6, 'guide-exploring'],
  ['Battle', 8, 'guide-battle'],
  ['Elements', 5, 'guide-elements'],
  ['Conditions', 3, 'guide-conditions'],
  ['Party and growth', 4, 'guide-party-and-growth'],
  ['Settings and saving', 17, 'guide-settings-and-saving'],
  ['Skill roadmap', 15, 'guide-skill-roadmap'],
];
let browser;
try {
  browser = await chromium.launch({ headless: true });
  for (const width of [320, 375, 768]) {
    const context = await browser.newContext({
      viewport: { width, height: 800 },
    });
    const page = await context.newPage(),
      errors = [];
    page.setDefaultTimeout(10000);
    page.on('pageerror', (e) => errors.push(e.message));
    await context.tracing.start({ screenshots: true, snapshots: true });
    const control = (a) => page.locator(`#app [data-action="${a}"]`).first();
    // Evaluation observes the whole journey and raw quick save; it never changes either.
    const snapshot = () =>
      page.evaluate(() => ({
        state: structuredClone(window.game.state),
        quick: localStorage.getItem('nothaven-save'),
      }));
    const inView = async (id) => {
      const b = await page.locator(`#${id} h2`).boundingBox();
      assert.ok(
        b && b.y >= -1 && b.y + b.height <= 801,
        `${id} heading in viewport: ${JSON.stringify(b)}`,
      );
    };
    // Viewport containment alone misses headings hidden beneath the sticky dock.
    const contentsClear = async () => {
      await inView('guide-contents');
      const b = await page.evaluate(() => {
        const h = document
            .querySelector('#guide-contents h2')
            .getBoundingClientRect(),
          d = document.querySelector('.audio-dock').getBoundingClientRect();
        return { top: h.top, bottom: h.bottom, dockBottom: d.bottom };
      });
      assert.ok(
        b.top >= b.dockBottom + 1,
        `Contents clears measured dock: ${JSON.stringify(b)}`,
      );
    };
    try {
      await page.goto(base);
      await control('guide').click();
      const before = await snapshot();
      assert.equal(before.quick, null);
      for (const scale of ['115', '130']) {
        await page.locator('[aria-controls="display-settings"]').click();
        await page.locator('[data-display-scale]').selectOption(scale);
        await page.locator('[data-display-done]').click();
        const nav = page.locator('nav.guide-toc'),
          links = nav.locator('a');
        assert.equal(await nav.getAttribute('id'), 'guide-contents');
        assert.equal(await page.locator('#guide-contents').count(), 1);
        assert.equal(
          await page.locator('.guide-section__back-link').count(),
          7,
        );
        assert.equal(await nav.getAttribute('aria-label'), 'Guide contents');
        assert.equal(await nav.getAttribute('aria-live'), null);
        assert.notEqual(await nav.getAttribute('role'), 'status');
        assert.equal(await links.count(), 7);
        await nav.scrollIntoViewIfNeeded();
        await page.mouse.move(0, 0);
        await page.waitForTimeout(250);
        for (const [i, [title, count, id]] of rows.entries()) {
          const link = links.nth(i);
          assert.equal(await link.textContent(), `${title} (${count})`);
          assert.equal(await link.getAttribute('href'), `#${id}`);
          assert.equal(await page.locator(`section#${id}`).count(), 1);
          assert.equal(await page.locator(`#${id} h2`).textContent(), title);
          assert.ok(
            await link.evaluate((n) => {
              const b = n.getBoundingClientRect(),
                r = document.createRange();
              r.selectNodeContents(n);
              return (
                b.height >= 44 &&
                b.left >= 0 &&
                b.right <= innerWidth + 1 &&
                [...r.getClientRects()].every(
                  (g) =>
                    g.left >= b.left - 1 &&
                    g.right <= b.right + 1 &&
                    g.top >= b.top - 1 &&
                    g.bottom <= b.bottom + 1,
                )
              );
            }),
            `${title} geometry`,
          );
        }
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth),
          width,
        );
        assert.deepEqual(await snapshot(), before);
        await page.screenshot({
          path: `${artifacts}/${width}-contents-${scale}.png`,
          fullPage: true,
        });
        for (const [title, count, id] of rows) {
          await page.locator(`nav a[href="#${id}"]`).click();
          assert.equal(new URL(page.url()).hash, `#${id}`);
          await inView(id);
          const boxes = await page.evaluate((id) => {
            const h = document
                .querySelector(`#${id} h2`)
                .getBoundingClientRect(),
              d = document.querySelector('.audio-dock').getBoundingClientRect();
            return {
              heading: { top: h.top, bottom: h.bottom },
              dock: { top: d.top, bottom: d.bottom },
            };
          }, id);
          assert.ok(
            boxes.heading.top >= boxes.dock.bottom + 1,
            `${width}/${scale}/${id} clears dock: ${JSON.stringify(boxes)}`,
          );
          if (title === 'Battle') {
            const lines = page.locator('#guide-battle > ul > li');
            const text = await lines.allTextContents();
            assert.equal(text.length, 8);
            assert.equal(text[0].split(SUPPORT_SENTENCE).length - 1, 1);
            assert.equal(text[0].split(KNOCKOUT_SENTENCE).length - 1, 1);
            assert.equal(text[0].split(FINISH_SENTENCE).length - 1, 1);
            assert.ok(text[0].endsWith(`${SUPPORT_SENTENCE} ${KNOCKOUT_SENTENCE} ${FINISH_SENTENCE}`));
            assert.ok(text.slice(1).every((line) => !line.includes(SUPPORT_SENTENCE) && !line.includes(KNOCKOUT_SENTENCE) && !line.includes(FINISH_SENTENCE)));
            const geometry = await lines.first().evaluate((li, sentence) => {
              const node = li.firstChild;
              if (node?.nodeType !== Node.TEXT_NODE) throw new Error('Expected Guide text node');
              const start = node.textContent.indexOf(sentence);
              if (start < 0) throw new Error('Missing literal support sentence');
              const range = document.createRange();
              range.setStart(node, start);
              range.setEnd(node, start + sentence.length);
              const b = li.getBoundingClientRect();
              const rects = [...range.getClientRects()].map((r) => ({
                left: r.left, right: r.right, top: r.top, bottom: r.bottom,
              }));
              return { text: range.toString(), rects,
                box: { left: b.left, right: b.right, top: b.top, bottom: b.bottom } };
            }, SUPPORT_SENTENCE);
            assert.equal(geometry.text, SUPPORT_SENTENCE);
            assert.ok(geometry.rects.length > 0);
            for (const r of geometry.rects) {
              assert.ok(r.left >= geometry.box.left - 1 && r.right <= geometry.box.right + 1);
              assert.ok(r.left >= -1 && r.right <= width + 1);
              assert.ok(r.top >= geometry.box.top - 1 && r.bottom <= geometry.box.bottom + 1);
            }
            // Scroll only: put the start of the new prose below the measured dock.
            await page.evaluate((top) => {
              const dock = document.querySelector('.audio-dock').getBoundingClientRect();
              window.scrollBy(0, top - dock.bottom - 12);
            }, geometry.rects[0].top);
            await page.screenshot({ path: `${artifacts}/${width}-support-${scale}-viewport.png` });
            assert.deepEqual(await snapshot(), before);
          }
          if (title === 'Elements')
            await page.screenshot({
              path: `${artifacts}/${width}-elements-${scale}-viewport.png`,
            });
          assert.deepEqual(await snapshot(), before);
          if (title === 'Battle' && scale === '130')
            await page.screenshot({
              path: `${artifacts}/${width}-battle-130.png`,
              fullPage: true,
            });
          const back = page.locator(`#${id} .guide-section__back-link`);
          assert.equal(await back.count(), 1);
          assert.equal(await back.textContent(), 'Back to contents');
          assert.equal(await back.getAttribute('href'), '#guide-contents');
          assert.equal(await back.getAttribute('data-action'), null);
          await back.scrollIntoViewIfNeeded();
          await page.mouse.move(0, 0);
          await page.waitForTimeout(250);
          assert.ok(
            await back.evaluate((n) => {
              const b = n.getBoundingClientRect(),
                r = document.createRange();
              r.selectNodeContents(n);
              return (
                b.height >= 44 &&
                b.left >= 0 &&
                b.right <= innerWidth + 1 &&
                [...r.getClientRects()].every(
                  (g) =>
                    g.left >= b.left - 1 &&
                    g.right <= b.right + 1 &&
                    g.top >= b.top - 1 &&
                    g.bottom <= b.bottom + 1,
                )
              );
            }),
            `${title} back link bounds`,
          );
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth),
            width,
          );
          if (title === 'Elements')
            await page.screenshot({
              path: `${artifacts}/${width}-back-link-${scale}-viewport.png`,
            });
          await back.click();
          assert.equal(new URL(page.url()).hash, '#guide-contents');
          await contentsClear();
          assert.deepEqual(await snapshot(), before);
          if (title === 'Elements')
            await page.screenshot({
              path: `${artifacts}/${width}-returned-contents-${scale}-viewport.png`,
            });
        }
      }
      await control('closeGuide').click();
      assert.equal((await snapshot()).state.scene, 'title');
      assert.equal((await snapshot()).quick, before.quick);
      await control('guide').click();
      assert.deepEqual(await snapshot(), before);
      // Native keyboard roundtrip: reach the roadmap, then its next-Tab return link.
      let found = false;
      for (let n = 0; n < 30; n++) {
        await page.keyboard.press('Tab');
        if (
          await page.evaluate(
            () =>
              document.activeElement?.getAttribute('href') ===
              '#guide-skill-roadmap',
          )
        ) {
          found = true;
          break;
        }
      }
      assert.ok(found, 'roadmap reachable by Tab');
      await page.keyboard.press('Enter');
      assert.equal(new URL(page.url()).hash, '#guide-skill-roadmap');
      await inView('guide-skill-roadmap');
      assert.deepEqual(await snapshot(), before);
      await page.keyboard.press('Tab');
      assert.ok(
        await page.evaluate(
          () =>
            document.activeElement?.classList.contains(
              'guide-section__back-link',
            ) &&
            document.activeElement.getAttribute('href') === '#guide-contents',
        ),
        'roadmap back link is next native Tab stop',
      );
      await page.keyboard.press('Enter');
      assert.equal(new URL(page.url()).hash, '#guide-contents');
      await contentsClear();
      assert.deepEqual(await snapshot(), before);
      await control('closeGuide').click();
      await control('guide').click();
      assert.deepEqual(await snapshot(), before);
      let battleFound = false;
      for (let n = 0; n < 30; n++) {
        await page.keyboard.press('Tab');
        if (await page.evaluate(() => document.activeElement?.getAttribute('href') === '#guide-battle')) {
          battleFound = true;
          break;
        }
      }
      assert.ok(battleFound, 'Battle reachable by native Tab');
      await page.keyboard.press('Enter');
      assert.equal(new URL(page.url()).hash, '#guide-battle');
      await inView('guide-battle');
      assert.deepEqual(await snapshot(), before);
      await page.keyboard.press('Tab');
      assert.ok(await page.evaluate(() =>
        document.activeElement?.closest('section')?.id === 'guide-battle' &&
        document.activeElement?.getAttribute('href') === '#guide-contents'),
        'Battle back link is next native Tab stop');
      await page.keyboard.press('Enter');
      assert.equal(new URL(page.url()).hash, '#guide-contents');
      await contentsClear();
      assert.deepEqual(await snapshot(), before);
      await control('closeGuide').click();
      await control('newGame').click();
      assert.equal((await snapshot()).state.scene, 'town');
      assert.equal((await snapshot()).quick, null);
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${width}: seven literal links and native destinations at115/130, link/text/document bounds, every clicked section and Contents heading clears measured dock, seven bounded 44px back links, literal support-sentence glyph bounds, Tab/Enter roadmap and Battle returns, Back/reopen/New journey, whole state and quicksave stable; errors []`,
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
      await context.tracing.stop({ path: `${artifacts}/${width}.zip` });
      await context.close();
    }
  }
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
