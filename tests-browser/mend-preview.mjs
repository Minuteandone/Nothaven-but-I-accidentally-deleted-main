import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// This short new-game smoke test is not a full campaign or balance proof.
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
    const mend = page.locator('[data-action="skill"][data-arg="mend"]');
    const preferences = async (scale, hints) => {
      await page.locator('[aria-controls="display-settings"]').click();
      await page.locator('[data-display-scale]').selectOption(scale);
      await page.locator('[data-display-shortcuts]').setChecked(hints);
      await page.locator('[data-display-done]').click();
    };
    try {
      await page.goto(base);
      assert.equal(await quick(), null);
      await click('newGame'); await click('explore');
      for (let i = 0; i < 6; i++) await click('moveEast');
      assert.equal((await state()).map.zoneId, 'ridge_road');
      for (let i = 0; i < 4; i++) await click('moveEast');
      const entered = await state();
      assert.equal(entered.scene, 'combat'); assert.equal(entered.combat.enemy.id, 'ridge_bandit');
      assert.equal(entered.party.length, 1);
      const hero = entered.party[0];
      assert.equal(hero.name, 'Wren'); assert.equal(hero.level, 1);
      assert.equal(hero.hp, 30); assert.equal(hero.maxHp, 30); assert.equal(hero.mp, 10);
      assert.ok(Object.values(hero.equipment || {}).every(value => !value));
      await click('attack');
      const wounded = await state(), saved = await quick();
      assert.equal(wounded.party[0].hp, 26); assert.ok(wounded.combat.enemy.hp > 0);
      await click('menu', 'skills');
      const preview = async snapshot => {
        assert.equal(await mend.locator('.skill-use-preview').textContent(), 'If used now: Wren +4 HP.');
        assert.equal(await mend.locator('.command-card__meta strong').textContent(), '4 MP');
        assert.equal(await mend.isEnabled(), true);
        assert.equal(await page.locator('[data-action="skill"]').count(), 2);
        assert.equal(await page.locator('[data-action="skill"][data-arg="power_strike"] .damage-range').count(), 1);
        assert.ok((await page.locator('.item-recipient-note').allTextContents()).includes(
          'Restoration previews show immediate effects before allies act and the normal enemy reply, not end-of-turn totals.'));
        assert.deepEqual(await state(), snapshot); assert.equal(await quick(), saved);
      };
      await preview(wounded);
      for (const scale of ['115', '130']) for (const hints of [true, false]) {
        await preferences(scale, hints); await preview(wounded);
        assert.equal(await page.locator('[data-display-scale]').inputValue(), scale);
        assert.equal(await page.locator('html').getAttribute('data-character-shortcuts'), hints ? 'on' : 'off');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
        const geometry = await page.locator('[data-action="skill"][data-arg="mend"], [data-action="menu"][data-arg="main"]').evaluateAll(nodes => nodes.map(button => {
          const box = button.getBoundingClientRect(), walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
          let node, fits = true;
          while ((node = walker.nextNode())) {
            if (!node.textContent.trim() || !node.parentElement.getClientRects().length) continue;
            const range = document.createRange(); range.selectNodeContents(node);
            for (const r of range.getClientRects()) fits &&= r.left >= box.left - 1 && r.right <= box.right + 1
              && r.top >= box.top - 1 && r.bottom <= box.bottom + 1 && r.left >= 0 && r.right <= innerWidth + 1;
          }
          return box.height >= 44 && box.left >= 0 && box.right <= innerWidth + 1 && fits;
        }));
        assert.equal(geometry.length, 2); assert.ok(geometry.every(Boolean));
        await page.screenshot({ path: path.join(artifacts, `${width}-earned-mend-${scale}-${hints ? 'on' : 'off'}.png`), fullPage: true });
      }
      await page.keyboard.press('Escape'); assert.deepEqual(await state(), wounded);
      await click('menu', 'skills'); await preview(wounded);
      for (const remainingMp of [6, 2]) {
        const before = await state();
        await click('skill', 'mend');
        const after = await state();
        assert.equal(after.party[0].mp, remainingMp);
        assert.equal(after.party[0].hp, 26, 'heal to cap followed by the normal enemy reply, not net +4');
        assert.equal(after.combat.turn, before.combat.turn + 1);
        assert.equal(after.combat.enemy.hp, before.combat.enemy.hp, 'solo Mend does not attack');
        const lines = after.combat.log.slice(before.combat.log.length);
        const healing = lines.indexOf('Wren uses Mend and recovers 4 HP.');
        assert.ok(healing >= 0, `actual capped healing matches preview: ${JSON.stringify(lines)}`);
        assert.ok(lines.slice(healing + 1).includes('Ridge Bandit hits Wren for 4.'), `enemy reply follows healing: ${JSON.stringify(lines)}`);
        for (const key of ['inventory', 'gold', 'story', 'map', 'bestiary']) assert.deepEqual(after[key], before[key], key);
        assert.equal(after.party[0].xp, before.party[0].xp); assert.equal(await quick(), saved);
        await click('menu', 'skills');
        if (remainingMp === 6) await preview(after);
        else {
          assert.equal(await mend.isDisabled(), true);
          assert.equal(await mend.locator('.skill-use-preview').count(), 0);
          assert.equal(await mend.locator('.command-card__meta strong').textContent(), '4 MP');
          assert.deepEqual(await state(), after); assert.equal(await quick(), saved);
        }
      }
      const exhausted = await state();
      await page.keyboard.press('Escape'); assert.deepEqual(await state(), exhausted);
      for (let turn = 0; turn < 40 && !(await state()).combat.over; turn++) await click('attack');
      const victory = await state();
      assert.equal(victory.combat.over, 'victory');
      assert.equal(victory.gold, entered.gold + 9); assert.equal(victory.party[0].xp, hero.xp + 10);
      assert.equal(await page.locator('.combat-outcome .battle-rewards').count(), 1);
      assert.equal(await page.locator('.combat-outcome .battle-rewards').textContent(), '+10 XP · +9 gold');
      await click('finish');
      if ((await state()).scene === 'rewardChoice') {
        assert.match(await page.locator('#app').innerText(), /Victory spoils/);
        await click('skip');
      }
      const finished = await state();
      assert.equal(finished.scene, 'explore'); assert.equal(finished.combat, null);
      assert.equal(finished.gold, victory.gold); assert.equal(finished.party[0].xp, victory.party[0].xp);
      assert.deepEqual(finished.inventory, victory.inventory); assert.equal(await quick(), saved);
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}px: fresh earned damage, 4 preview layouts, two Mend actions, insufficient MP, victory/Finish; browser errors []`);
    } catch (error) {
      await page.screenshot({ path: path.join(artifacts, `${width}-earned-mend-failure.png`), fullPage: true }).catch(() => {});
      await context.tracing.stop({ path: path.join(artifacts, `${width}-earned-mend-failure-trace.zip`) }).catch(() => {});
      throw error;
    } finally { await context.close(); }
  }
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
