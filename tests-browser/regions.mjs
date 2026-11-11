import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// This earned chapter-and-regions journey is not a full-game or balance proof.
// All progress comes from UI clicks and key presses. Evaluation only observes game state/layout;
// the one controlled input is Math.random, to avoid incidental patrols.
const root = fileURLToPath(new URL('../', import.meta.url));
const artifacts = path.join(root, 'browser-artifacts', 'regions');
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
  for (const width of [320, 375, 768]) for (const ending of ['protect_town', 'share_signal']) for (const first of ['coast', 'heights']) {
    const id = `${width}-${ending}-${first}`;
    const context = await browser.newContext({ viewport: { width, height: 800 } });
    const errors = [];
    try {
      await context.tracing.start({ screenshots: true, snapshots: true });
      const page = await context.newPage();
      page.setDefaultTimeout(10_000);
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => { Math.random = () => 0.5; });
      const control = (action, arg) => page.locator(`#app [data-action="${action}"]${arg === undefined ? '' : `[data-arg="${arg}"]`}`).first();
      const click = (action, arg) => control(action, arg).click();
      const state = () => page.evaluate(() => structuredClone(window.game.state));
      const quick = () => page.evaluate(() => localStorage.getItem('nothaven-save'));
      const fit = async (label, selector) => {
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, `${id} ${label}: document fits`);
        const bounds = await page.locator(selector).evaluateAll(nodes => nodes.map(node => {
          const r = node.getBoundingClientRect();
          return r.height >= 44 && r.left >= 0 && r.right <= innerWidth + 1 && node.scrollWidth <= node.clientWidth + 1;
        }));
        assert.ok(bounds.length > 0 && bounds.every(Boolean), `${id} ${label}: controls and labels fit`);
        await page.screenshot({ path: path.join(artifacts, `${id}-${label}.png`), fullPage: true });
      };
      const walk = async (tx, ty) => {
        // Catalog and state are observed only. Every selected step is a native click.
        const route = await page.evaluate(async ({ tx, ty }) => {
          const { ZONES, isWalkable } = await import('/src/map/index.js');
          const map = window.game.state.map, zone = ZONES[map.zoneId];
          const queue = [[map.x, map.y, []]], seen = new Set([`${map.x},${map.y}`]);
          while (queue.length) {
            const [x, y, steps] = queue.shift();
            if (x === tx && y === ty) return steps;
            for (const [dx, dy, action] of [[1, 0, 'moveEast'], [-1, 0, 'moveWest'], [0, 1, 'moveSouth'], [0, -1, 'moveNorth']]) {
              const nx = x + dx, ny = y + dy, key = `${nx},${ny}`;
              if (seen.has(key) || !isWalkable(zone, map, nx, ny)) continue;
              if (zone.npcs?.some(n => n.x === nx && n.y === ny)) continue;
              if (nx !== tx || ny !== ty) {
                if (zone.exits?.some(e => e.x === nx && e.y === ny)) continue;
                if (zone.encounters?.some(e => e.x === nx && e.y === ny && !map.clearedEncounters[e.encounterId])) continue;
              }
              seen.add(key); queue.push([nx, ny, [...steps, action]]);
            }
          }
          return null;
        }, { tx, ty });
        assert.ok(route, `${id}: walkable route to ${tx},${ty}`);
        for (const action of route) {
          assert.equal((await state()).scene, 'explore', 'walking must not conceal a battle');
          await click(action);
        }
      };
      const exit = async destination => {
        const tile = await page.evaluate(async destination => {
          const { ZONES } = await import('/src/map/index.js');
          return ZONES[window.game.state.map.zoneId].exits.find(e => e.toZone === destination);
        }, destination);
        assert.ok(tile, `physical exit to ${destination}`);
        await walk(tile.x, tile.y);
        const s = await state();
        assert.equal(s.scene, 'explore');
        assert.equal(s.map.zoneId, destination); assert.equal(s.location, destination);
      };
      let combatGold = 0;
      const fight = async encounterId => {
        const tile = await page.evaluate(async encounterId => {
          const { ZONES } = await import('/src/map/index.js');
          return ZONES[window.game.state.map.zoneId].encounters.find(e => e.encounterId === encounterId);
        }, encounterId);
        assert.ok(tile); await walk(tile.x, tile.y);
        const before = await state();
        assert.equal(before.scene, 'combat'); assert.equal(before.combat.encounterId, encounterId);
        const enemy = before.combat.enemy;
        for (let turn = 0; !(await state()).combat.over && turn < 100; turn++) await click('attack');
        const won = await state();
        assert.equal(won.combat.over, 'victory', `earned victory: ${encounterId}`);
        assert.equal(won.gold, before.gold + enemy.gold);
        assert.equal(won.combat.rewards.gold, enemy.gold); assert.equal(won.combat.rewards.xp, enemy.xp);
        won.party.forEach((m, i) => assert.equal(m.xp, before.party[i].xp + enemy.xp));
        assert.deepEqual(won.bestiary, { ...before.bestiary, [enemy.id]: (before.bestiary?.[enemy.id] || 0) + 1 });
        const inventory = structuredClone(before.inventory);
        for (const drop of won.combat.rewards.items) {
          const stack = inventory.find(item => item.id === drop.id);
          if (stack) stack.qty += drop.qty; else inventory.push({ ...drop });
        }
        assert.deepEqual(won.inventory, inventory, 'real victory loot is added exactly once');
        await click('finish');
        if ((await state()).scene === 'rewardChoice') {
          assert.match(await page.locator('#app').innerText(), /Victory spoils/);
          await click('skip');
        }
        const after = await state();
        assert.equal(after.scene, 'explore'); assert.equal(after.combat, null);
        assert.equal(after.map.activeEncounterId, null); assert.equal(after.map.clearedEncounters[encounterId], true);
        for (const key of ['gold', 'inventory', 'bestiary']) assert.deepEqual(after[key], won[key], `Finish preserves ${key}`);
        assert.deepEqual(after.party.map(m => m.xp), won.party.map(m => m.xp));
        combatGold += enemy.gold;
      };
      const checkpoint = async (stage, label) => {
        const before = await state();
        assert.equal(before.scene, 'explore'); assert.equal(before.story.stage, stage);
        await click('save');
        const raw = await quick();
        // Save writes before adding its live map-log message. Compare to pre-click state.
        assert.deepEqual(JSON.parse(raw), before, 'the full earned checkpoint is serialized');
        await page.reload(); await click('continue');
        assert.deepEqual(await state(), before, 'Continue restores the entire earned exploration checkpoint');
        assert.equal(await quick(), raw, 'Continue does not rewrite the save');
        assert.equal(await page.locator('html').getAttribute('data-text-size'), '130');
        await fit(label, '#app [data-action="save"]');
      };
      const talk = async (npc, reward, stage) => {
        const before = await state(); await click('storyTalk', npc); const after = await state();
        assert.equal(after.gold, before.gold + reward, `${npc}: exact turn-in payment`);
        assert.equal(after.story.stage, stage);
      };
      try {
        await page.goto(base); await click('newGame');
        await page.locator('[aria-controls="display-settings"]').click();
        await page.locator('[data-display-scale]').selectOption('130');
        await page.locator('[data-display-done]').click();
        await click('explore'); await talk('mara', 0, 'road');
        await exit('ridge_road'); await fight('ridge_patrol'); await walk(5, 5);
        assert.equal((await state()).story.flags.dispatch_ridge, true);
        await checkpoint('road_report', 'ridge');
        await exit('greyhaven'); await talk('mara', 20, 'lens_briefing'); await talk('iven', 0, 'lens');
        await exit('ridge_road'); await exit('observatory_ruins');
        await fight('observatory_sentinel'); await walk(1, 3);
        assert.equal((await state()).story.flags.dispatch_observatory, true);
        await checkpoint('lens_report', 'observatory');
        await exit('beacon_tower');
        assert.equal(await page.locator('[data-action="storyChoose"]').count(), 0, 'premature tower visit cannot skip council');
        assert.equal((await state()).story.ending, null);
        await exit('greyhaven'); await click('toTownScene'); await click('muster');
        await click('recruit', 'tamsin'); await click('recruit', 'iven');
        assert.deepEqual((await state()).party.map(m => m.id), ['hero', 'tamsin', 'iven']);
        await click('leave');
        const restGold = (await state()).gold; await click('rest');
        assert.equal((await state()).gold, restGold - 5);
        await click('explore'); await talk('iven', 35, 'council');
        await talk('mara', 0, 'council'); await talk('tamsin', 15, 'council');
        assert.equal((await state()).story.flags.dispatch_reward, true);
        for (const zone of ['ridge_road', 'observatory_ruins', 'beacon_tower']) await exit(zone);
        await checkpoint('decision', 'decision');
        assert.equal(await page.locator('[data-action="storyChoose"]').count(), 2);
        await fit('choices', '#app [data-action="storyChoose"]');
        const choiceGold = (await state()).gold; await click('storyChoose', ending);
        const complete = await state();
        assert.equal(complete.scene, 'ending'); assert.equal(complete.story.stage, 'complete');
        assert.equal(complete.story.ending, ending); assert.equal(complete.flags.endingShown, true);
        assert.equal(complete.gold, choiceGold + 50);
        assert.equal(complete.gold, 20 + combatGold + 120 - 5, 'all chapter rewards paid exactly once');
        const heading = ending === 'protect_town' ? 'The Shielded Town' : 'Lanterns on the Horizon';
        assert.equal(await page.locator('#app h1').innerText(), heading);
        await fit('ending', '#app .ending button');
        await click('keepExploring'); await checkpoint('complete', 'completed-tower');
        assert.equal(await page.locator('[data-action="storyChoose"]').count(), 0, 'completed choice is no longer offered');
        await exit('greyhaven');
        for (const npc of ['mara', 'iven', 'tamsin']) await talk(npc, 0, 'complete');
        const home = await state();
        assert.equal(home.scene, 'explore'); assert.equal(home.gold, complete.gold);
        assert.equal(home.story.ending, ending);
        await click('toTownScene'); const town = await state();
        await click('chronicle'); assert.equal(await page.locator('#app h1').innerText(), heading);
        await click('keepExploring'); assert.deepEqual(await state(), town, 'chronicle roundtrip cannot repay or mutate progress');
        await click('explore'); await checkpoint('complete', 'home');
        assert.equal((await state()).story.ending, ending);
        await click('toTownScene'); await click('shop');
        const shopping = await state();
        await click('buy', 'rations'); await click('buy', 'rations'); await click('buy', 'bandage');
        const stocked = await state();
        const addItems = (inventory, items) => {
          const result = structuredClone(inventory);
          for (const item of items) {
            const stack = result.find(s => s.id === item.id);
            if (stack) stack.qty += item.qty; else result.push({ ...item });
          }
          return result;
        };
        assert.equal(stocked.gold, shopping.gold - 22);
        assert.deepEqual(stocked.inventory, addItems(shopping.inventory, [{ id: 'rations', qty: 2 }, { id: 'bandage', qty: 1 }]));
        await click('leave'); await click('explore'); await talk('tamsin', 0, 'complete');
        const beforeRelief = await state();
        await fit('relief-ready', '#app [data-action="storyRelief"]');
        await click('storyRelief');
        const relief = await state();
        assert.equal(relief.gold, beforeRelief.gold + 30);
        assert.deepEqual(relief.inventory, shopping.inventory);
        assert.deepEqual(relief.story, { ...beforeRelief.story, flags: { ...beforeRelief.story.flags, relief_reward: true } });
        assert.equal(relief.story.ending, ending); assert.equal(relief.scene, 'explore');
        assert.equal(await control('storyRelief').count(), 0);
        await checkpoint('complete', 'relief');
        assert.equal(await control('storyRelief').count(), 0);
        const beforeAccept = await state();
        await click('storyRescue', 'accept');
        assert.equal((await state()).gold, beforeAccept.gold);
        assert.equal((await state()).story.flags.rescue_accepted, true);
        await checkpoint('complete', 'rescue-accepted');
        const routes = {
          coast: { zone: 'saltmere_coast', encounter: 'saltmere_rescue', cache: 'saltmere_supply_cache' },
          heights: { zone: 'highwatch_pass', encounter: 'highwatch_rescue', cache: 'highwatch_supply_cache' },
        };
        for (const routeId of [first, first === 'coast' ? 'heights' : 'coast']) {
          const route = routes[routeId];
          assert.equal((await state()).map.zoneId, 'greyhaven');
          if (routeId === 'heights') await exit('ridge_road');
          await exit(route.zone);
          assert.equal((await state()).story.flags[`rescue_visit_${routeId}`], true);
          await fight(route.encounter);
          assert.equal((await state()).story.flags[`rescue_victory_${routeId}`], true);
          assert.equal((await state()).story.flags.rescue_reward, undefined, 'rescues do not auto-pay');
          const cache = await page.evaluate(async cacheId => {
            const { ZONES } = await import('/src/map/index.js');
            return ZONES[window.game.state.map.zoneId].interactables.find(i => i.id === cacheId);
          }, route.cache);
          assert.ok(cache); await walk(cache.x, cache.y);
          const beforeCache = await state();
          await click('mapInteract', route.cache);
          const collected = await state();
          assert.equal(collected.map.completedInteractions[route.cache], true);
          assert.deepEqual(collected.inventory, addItems(beforeCache.inventory, cache.rewards));
          assert.equal(collected.gold, beforeCache.gold);
          assert.equal(collected.story.ending, ending); assert.equal(collected.story.stage, 'complete');
          assert.equal(await control('mapInteract', route.cache).count(), 0, 'collected cache cannot be claimed again through the UI');
          assert.deepEqual((await state()).inventory, collected.inventory, 'cache supplies remain exact');
          assert.equal((await state()).gold, collected.gold);
          await checkpoint('complete', `rescued-${routeId}`);
          assert.equal(await control('mapInteract', route.cache).count(), 0, 'collected cache stays unavailable after reload');
          assert.deepEqual((await state()).inventory, collected.inventory);
          assert.equal((await state()).gold, collected.gold);
          await exit(routeId === 'coast' ? 'greyhaven' : 'ridge_road');
          if (routeId === 'heights') await exit('greyhaven');
        }
        assert.equal((await state()).story.flags.rescue_first, first);
        await talk('mara', 0, 'complete');
        const beforeReport = await state();
        await fit('rescue-ready', '#app [data-action="storyRescue"][data-arg="report"]');
        await click('storyRescue', 'report');
        const paid = await state();
        assert.equal(paid.gold, beforeReport.gold + 80);
        assert.equal(paid.gold, 20 + combatGold + 120 - 5 - 22 + 30 + 80, 'exact chapter and regional economy');
        assert.equal(paid.story.flags.rescue_reward, true); assert.equal(paid.story.flags.relief_reward, true);
        assert.equal(paid.story.ending, ending); assert.equal(paid.story.stage, 'complete'); assert.equal(paid.scene, 'explore');
        assert.equal(await control('storyRescue', 'report').count(), 0);
        await checkpoint('complete', 'rescue-paid');
        assert.equal(await control('storyRescue', 'report').count(), 0);
        await click('toTownScene'); await click('muster');
        const oldCompany = await state();
        await click('dismiss', 'tamsin'); await click('dismiss', 'iven');
        await click('recruit', 'bram'); await click('recruit', 'sela');
        const company = await state();
        assert.deepEqual(company.party.map(m => m.id), ['hero', 'bram', 'sela']);
        assert.equal(Array.isArray(company.reserve), false);
        for (const memberId of ['tamsin', 'iven']) {
          const original = oldCompany.party.find(m => m.id === memberId);
          assert.deepEqual(company.reserve[memberId], { ...original, statuses: [] });
        }
        for (const key of ['gold', 'inventory', 'story', 'bestiary']) assert.deepEqual(company[key], oldCompany[key], `Muster preserves ${key}`);
        await fit('new-company', '#app [data-action="leave"]');
        await click('leave'); await click('explore'); await checkpoint('complete', 'new-company-saved');
        assert.deepEqual(errors, []);
        console.log(`PASS ${id}: earned chapter, Relief, both rescues and caches, exact payments, exclusive ending, new companions/reserve and eleven full save/reload checkpoints; browser errors []`);
      } catch (error) {
        await page.screenshot({ path: path.join(artifacts, `${id}-failure.png`), fullPage: true }).catch(() => {});
        console.error(`FAIL ${id}; browser errors: ${JSON.stringify(errors)}`);
        throw error;
      }
    } finally {
      try { await context.tracing.stop({ path: path.join(artifacts, `${id}-trace.zip`) }); }
      finally { await context.close(); }
    }
  }
} finally {
  try { if (browser) await browser.close(); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
