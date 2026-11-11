import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// This short earned escape test is not a full campaign or balance proof.
// All progress comes from UI clicks and key presses. Evaluation only observes game state/layout;
// the one controlled input is Math.random, to avoid incidental patrols.
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
let browser;
try {
  browser = await chromium.launch({ headless: true });
  for (const width of [320, 375, 768]) {
    const context = await browser.newContext({ viewport: { width, height: 800 } });
    await context.tracing.start({ screenshots: true, snapshots: true });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { Math.random = () => 0.5; });
    const click = (action, arg) => page.locator(`[data-action="${action}"]${arg === undefined ? '' : `[data-arg="${arg}"]`}`).first().click();
    const state = () => page.evaluate(() => structuredClone(window.game.state));
    const quick = () => page.evaluate(() => localStorage.getItem('nothaven-save'));
    const preferences = async (scale, hints) => {
      await page.locator('[aria-controls="display-settings"]').click();
      await page.locator('[data-display-scale]').selectOption(scale);
      await page.locator('[data-display-shortcuts]').setChecked(hints);
      await page.locator('[data-display-done]').click();
    };
    const flee = page.locator('[data-action="flee"]');
    const stableKeys = ['inventory', 'gold', 'story', 'map', 'bestiary', 'ledger'];
    const unrelated = (after, before) => {
      for (const key of stableKeys) assert.deepEqual(after[key], before[key], key);
      assert.equal(after.party[0].xp, before.party[0].xp);
    };
    try {
      await page.goto(base);
      assert.equal(await quick(), null);
      await click('newGame'); await click('explore');
      for (let i = 0; i < 6; i++) await click('moveEast');
      assert.equal((await state()).map.zoneId, 'ridge_road');
      for (let i = 0; i < 4; i++) await click('moveEast');
      const entered = await state();
      assert.equal(entered.scene, 'combat'); assert.equal(entered.party.length, 1);
      const hero = entered.party[0], foe = entered.combat.enemy;
      assert.equal(hero.name, 'Wren'); assert.equal(hero.level, 1);
      assert.equal(hero.hp, 30); assert.equal(hero.mp, 10); assert.equal(hero.spd, 5);
      assert.ok(Object.values(hero.equipment || {}).every(value => !value));
      assert.equal(foe.id, 'ridge_bandit'); assert.equal(foe.spd, 5); assert.equal(foe.hp, 20);
      assert.ok(entered.combat.encounterId);
      const badge = async snapshot => {
        assert.equal(await flee.isEnabled(), true);
        assert.equal(await flee.locator('.flee-chance-badge').count(), 1);
        assert.equal(await flee.locator('.flee-chance-badge').textContent(), '50%');
        assert.equal(await flee.getAttribute('title'), "Escape odds: 50%. Your SPD against the foe's SPD.");
        assert.deepEqual(await state(), snapshot); assert.equal(await quick(), null);
      };
      await badge(entered);
      for (const scale of ['115', '130']) for (const hints of [true, false]) {
        await preferences(scale, hints); await badge(entered);
        assert.equal(await page.locator('[data-display-scale]').inputValue(), scale);
        assert.equal(await page.locator('html').getAttribute('data-character-shortcuts'), hints ? 'on' : 'off');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
        const fits = await flee.evaluate(button => {
          const box = button.getBoundingClientRect(), walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
          let node, fits = box.height >= 44 && box.left >= 0 && box.right <= innerWidth + 1;
          while ((node = walker.nextNode())) {
            if (!node.textContent.trim() || !node.parentElement.getClientRects().length) continue;
            const range = document.createRange(); range.selectNodeContents(node);
            for (const r of range.getClientRects()) fits &&= r.left >= box.left - 1 && r.right <= box.right + 1
              && r.top >= box.top - 1 && r.bottom <= box.bottom + 1 && r.left >= 0 && r.right <= innerWidth + 1;
          }
          return fits;
        });
        assert.ok(fits, 'Flee button and visible text fit at the selected scale');
        await page.screenshot({ path: path.join(artifacts, `${width}-earned-flee-${scale}-${hints ? 'on' : 'off'}.png`), fullPage: true });
      }
      await click('menu', 'skills'); assert.deepEqual(await state(), entered);
      await page.keyboard.press('Escape'); await badge(entered);
      await click('flee'); // 0.5 is not less than the displayed 50% boundary.
      const failed = await state();
      assert.equal(failed.combat.over, null);
      assert.equal(failed.combat.turn, entered.combat.turn + 1);
      assert.deepEqual(failed.combat.log.slice(entered.combat.log.length), ['You fail to get away!', 'Ridge Bandit hits Wren for 4.']);
      assert.equal(failed.party[0].hp, 26); assert.equal(failed.party[0].mp, 10);
      assert.equal(failed.combat.enemy.hp, 20); unrelated(failed, entered);
      assert.equal(await page.locator('.combat-outcome').count(), 0);
      assert.equal(await page.locator('.battle-rewards').count(), 0);
      await badge(failed);
      // Controlled RNG is the only evaluation-side write; no game/save state is injected.
      await page.evaluate(() => { Math.random = () => 0.49; });
      await click('flee');
      const escaped = await state();
      assert.equal(escaped.combat.over, 'fled');
      assert.equal(escaped.combat.turn, failed.combat.turn);
      assert.deepEqual(escaped.combat.log.slice(failed.combat.log.length), ['You get away safely.']);
      assert.deepEqual(escaped.party, failed.party);
      assert.equal(escaped.combat.enemy.hp, 20); unrelated(escaped, failed);
      assert.equal(await page.locator('.combat-outcome strong').textContent(), 'Escaped');
      assert.equal(await page.locator('.battle-rewards').count(), 0);
      assert.equal(await quick(), null);
      await click('finish');
      const finished = await state();
      assert.equal(finished.scene, 'explore'); assert.equal(finished.combat, null);
      assert.equal(finished.map.activeEncounterId, null);
      assert.deepEqual(finished.map.clearedEncounters, entered.map.clearedEncounters);
      assert.notEqual(finished.map.clearedEncounters[entered.combat.encounterId], true);
      for (const key of ['inventory', 'gold', 'story', 'bestiary']) assert.deepEqual(finished[key], escaped[key], key);
      assert.deepEqual(finished.party, escaped.party);
      assert.equal(finished.ledger.escapes, 1);
      for (const key of ['victories', 'bossVictories', 'defeats', 'comebacks', 'streak', 'bestStreak', 'stormbornBossVictories']) assert.equal(finished.ledger[key], 0, key);
      assert.equal(finished.ledger.pendingComeback, false);
      assert.equal(await quick(), null); assert.deepEqual(errors, []);
      console.log(`PASS ${width}px: earned 50% badge, four readonly layouts, failed boundary attempt, successful escape, Finish ledger/no rewards; browser errors []`);
    } catch (error) {
      await page.screenshot({ path: path.join(artifacts, `${width}-earned-flee-failure.png`), fullPage: true }).catch(() => {});
      await context.tracing.stop({ path: path.join(artifacts, `${width}-earned-flee-failure-trace.zip`) }).catch(() => {});
      throw error;
    } finally { await context.close(); }
  }
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
