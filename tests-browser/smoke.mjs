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
    const progress = async () => { const s = await state(); delete s.scene; return s; };
    const setShortcuts = async enabled => {
      const before = await state();
      await page.locator('[aria-controls="display-settings"]').click();
      await page.locator('[data-display-shortcuts]').setChecked(enabled);
      await page.locator('[data-display-done]').click();
      assert.equal(await page.locator('html').getAttribute('data-character-shortcuts'), enabled ? 'on' : 'off');
      assert.deepEqual(await state(), before, 'device preference must not change journey state');
    };
    const fit = async label => {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, `${label}: horizontal overflow at ${width}`);
      await page.screenshot({ path: path.join(artifacts, `${width}-${label}.png`), fullPage: true });
    };
    const checkBagSearch = async () => {
      const town = await state();
      const quick = await page.evaluate(() => localStorage.getItem('nothaven-save'));
      await click('bag');
      const bag = await state();
      const inventoryNames = page.locator('.bag-group:not([aria-label="Equipped"]) .bag-list .bag-name');
      const recipes = page.locator('.craft-table tr');
      const allRecipes = await recipes.count();
      const allNames = await inventoryNames.allTextContents();
      assert.deepEqual(allNames, ['Trail Rations ×3'], 'search uses genuinely purchased supplies');
      assert.ok(allRecipes > 0, 'recipe catalogue is present');
      const unchanged = async () => {
        assert.deepEqual(await state(), bag, 'Bag search/sort must preserve the whole journey state');
        assert.equal(await page.evaluate(() => localStorage.getItem('nothaven-save')), quick);
      };
      const search = async query => {
        await page.locator('#bag-search-input').fill(query);
        await click('bagSearchApply');
        await unchanged();
      };
      const searchFit = async label => {
        await fit(label);
        const controls = await page.locator('.bag-search-row input,.bag-search-row button').evaluateAll(nodes => nodes.map(node => {
          const r = node.getBoundingClientRect();
          return r.left >= 0 && r.right <= innerWidth + 1 && r.height >= 44
            && (node.tagName === 'INPUT' || node.scrollWidth <= node.clientWidth + 1);
        }));
        assert.equal(controls.length, 3);
        assert.ok(controls.every(Boolean), 'search controls and button text must fit; single-line input may scroll internally');
      };
      for (const scale of ['115', '130']) {
        await page.locator('[aria-controls="display-settings"]').click();
        await page.locator('[data-display-scale]').selectOption(scale);
        await page.locator('[data-display-done]').click();
        await search('  TrAiL RaTiOnS  ');
        assert.equal(await page.locator('#bag-search-input').inputValue(), 'TrAiL RaTiOnS');
        assert.deepEqual(await inventoryNames.allTextContents(), allNames);
        assert.equal(await recipes.count(), 2, 'rations match both broth/chowder ingredient recipes');
        await click('bagSort', 'value');
        await unchanged();
        assert.equal(await page.locator('#bag-search-input').inputValue(), 'TrAiL RaTiOnS');
        assert.equal(await page.locator('[data-action="bagSort"][data-arg="value"]').getAttribute('aria-pressed'), 'true');
        await search('storm glass');
        assert.equal(await inventoryNames.count(), 0);
        assert.equal(await recipes.count(), 10, 'ingredient search includes recipes without owning that ingredient');
        await searchFit(`bag-search-glass-${scale}`);
        const longQuery = 'x'.repeat(120);
        await search(longQuery);
        assert.equal(await inventoryNames.count(), 0);
        assert.equal(await recipes.count(), 0);
        assert.ok((await page.locator('.bag-empty').textContent()).includes(longQuery));
        await searchFit(`bag-search-long-${scale}`);
        const glyphs = await page.locator('.bag-empty').evaluate(node => {
          const range = document.createRange(); range.selectNodeContents(node);
          return [...range.getClientRects()].map(r => ({ left: r.left, right: r.right }));
        });
        assert.ok(glyphs.length > 0 && glyphs.every(r => r.left >= 0 && r.right <= width + 1), 'visible no-match text must wrap inside the viewport');
        await search('<img src=x onerror=alert(1)>');
        assert.equal(await page.locator('.bag-empty img').count(), 0, 'query markup is escaped');
        assert.ok((await page.locator('.bag-empty').textContent()).includes('<img src=x onerror=alert(1)>'));
        await click('bagSearchClear');
        await unchanged();
        assert.equal(await page.locator('#bag-search-input').inputValue(), '');
        assert.deepEqual(await inventoryNames.allTextContents(), allNames);
        assert.equal(await recipes.count(), allRecipes);
        assert.equal(await page.locator('[data-action="bagSort"][data-arg="value"]').getAttribute('aria-pressed'), 'true');
        await search('storm glass'); await click('leave');
        assert.deepEqual(await state(), town);
        await click('bag');
        assert.equal(await page.locator('#bag-search-input').inputValue(), '', 'reopening resets the transient query');
        assert.equal(await page.locator('[data-action="bagSort"][data-arg="value"]').getAttribute('aria-pressed'), 'true');
        await unchanged();
        await searchFit(`bag-search-reopened-${scale}`);
      }
      await page.locator('[aria-controls="display-settings"]').click();
      await page.locator('[data-display-scale]').selectOption('100');
      await page.locator('[data-display-done]').click();
      await unchanged(); await click('leave');
      assert.deepEqual(await state(), town);
    };
    const readOnlyVisit = async (action, title) => {
      const before = await progress();
      // Bag rendering initializes missing empty slots; this changes only our
      // expected snapshot, never live game state. All other fields stay strict.
      if (action === 'bag' && !before.party[0].equipment) {
        before.party[0].equipment = { weapon: null, armor: null, trinket: null };
      }
      await click(action);
      assert.match(await page.locator('main h1, main h2').first().innerText(), title);
      await fit(action);
      if (action === 'muster') {
        for (const scale of ['115', '130']) {
          await page.locator('[aria-controls="display-settings"]').click();
          await page.locator('[data-display-scale]').selectOption(scale);
          await page.locator('[data-display-done]').click();
          await fit(`muster-text-${scale}`);
          assert.deepEqual(await progress(), before, 'larger text must not change party progress');
          const headings = await page.locator('.muster-section-heading').evaluateAll(rows => rows.map(row => {
            const bounds = row.getBoundingClientRect();
            return [...row.children].every(child => {
              const rect = child.getBoundingClientRect();
              return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1;
            });
          }));
          assert.deepEqual(headings, [true, true], 'Muster heading and count must fit without clipping');
        }
        await page.locator('[aria-controls="display-settings"]').click();
        await page.locator('[data-display-scale]').selectOption('100');
        await page.locator('[data-display-done]').click();
      }
      await click('leave');
      assert.equal((await state()).scene, 'town');
      assert.deepEqual(await progress(), before, `${action}: opening and closing changed progress`);
    };
    try {
      await page.goto(base);
      assert.equal(await page.locator('[data-action="continue"]').isDisabled(), true);
      await fit('title');
      await click('guide'); await fit('guide'); await click('closeGuide');
      await click('newGame'); await fit('town');
      const initial = await progress();
      await click('questJournal');
      for (const filter of ['active', 'complete', 'all']) {
        await click('filterQuests', filter);
        assert.equal(await page.locator('[aria-pressed="true"]').count(), 1);
        assert.equal(await page.locator(`[data-action="filterQuests"][data-arg="${filter}"]`).getAttribute('aria-pressed'), 'true');
        if (filter === 'complete') assert.match(await page.locator('main').innerText(), /No completed objectives yet\./);
        else assert.deepEqual(await page.locator('.quest-entry h2').allTextContents(), ['A Light in the Storm']);
        await fit(`journal-${filter}`);
        assert.deepEqual(await progress(), initial);
      }
      await click('leave');
      await readOnlyVisit('bestiary', /Field Journal/);
      await readOnlyVisit('muster', /Muster/i);
      await readOnlyVisit('bag', /Bag/i);
      await click('shop');
      await click('buy5', 'rations');
      assert.equal((await state()).gold, 2);
      assert.equal((await state()).inventory.find(item => item.id === 'rations').qty, 3);
      const purchased = await progress();
      for (const mode of ['buy', 'sell', 'craft']) {
        await click('setMode', mode); await fit(`shop-${mode}`);
        assert.deepEqual(await progress(), purchased);
      }
      await click('leave'); await click('save');
      await page.reload(); await click('continue');
      assert.equal((await state()).gold, 2);
      assert.equal((await state()).inventory.find(item => item.id === 'rations').qty, 3);
      await checkBagSearch();
      await click('explore');
      const inField = await progress();
      await click('openQuests'); await click('filterQuests', 'all'); await click('leave');
      assert.equal((await state()).scene, 'explore');
      assert.deepEqual(await progress(), inField);
      await fit('explore');
      // Opt out using the actual device-local control, without altering progress.
      await setShortcuts(false);
      const beforeMapKeys = await state();
      assert.equal(await page.locator('[data-action="moveEast"]').getAttribute('aria-keyshortcuts'), 'ArrowRight');
      assert.equal(await page.locator('[data-action="waitTurn"]').getAttribute('aria-keyshortcuts'), null);
      for (const key of ['w', 'a', 's', 'd', 'e', '1', '9', 'Numpad1']) {
        await page.keyboard.press(key);
        assert.deepEqual(await state(), beforeMapKeys, `${key}: opted-out exploration shortcut acted`);
      }
      await page.keyboard.press('ArrowRight');
      assert.equal((await state()).map.x, beforeMapKeys.map.x + 1);
      await click('moveWest');
      assert.equal((await state()).map.x, beforeMapKeys.map.x);
      const beforeSurvey = await state();
      await page.locator('[data-action="waitTurn"]').focus();
      await page.keyboard.press('Enter');
      assert.notDeepEqual((await state()).map.log, beforeSurvey.map.log, 'native Survey still works');
      await click('moveNorth'); // Adjacent to Mara at (3, 2), not a walk-through tile.
      assert.ok(await page.locator('.nearby-action').count() > 0);
      assert.equal(await page.locator('.nearby-action[aria-keyshortcuts]').count(), 0);
      const beforeNearby = await state();
      const nearbyText = await page.locator('#app').innerText();
      await page.keyboard.press('1');
      assert.deepEqual(await state(), beforeNearby, 'opted-out nearby action changed state');
      assert.equal(await page.locator('#app').innerText(), nearbyText, 'opted-out nearby action opened dialogue');
      await fit('explore-shortcuts-off');
      await click('save'); await page.reload(); await click('continue');
      assert.equal(await page.locator('html').getAttribute('data-character-shortcuts'), 'off');
      if ((await state()).scene === 'town') await click('explore');
      const afterReload = await state();
      await page.keyboard.press('d');
      assert.deepEqual(await state(), afterReload, 'opt-out must persist after reload');
      await setShortcuts(true);
      await page.keyboard.press('s');
      assert.equal((await state()).map.y, afterReload.map.y + 1);
      await page.keyboard.press('w');
      assert.equal((await state()).map.y, afterReload.map.y);
      const beforeEnabledSurvey = await state();
      await page.keyboard.press('e');
      assert.notDeepEqual((await state()).map.log, beforeEnabledSurvey.map.log, 're-enabled Survey works');
      assert.equal((await state()).story.stage, 'briefing');
      assert.equal(await page.locator('.nearby-action[aria-keyshortcuts="1"]').getAttribute('data-arg'), 'mara');
      await page.keyboard.press('1');
      assert.equal((await state()).story.stage, 'road', 're-enabled nearby shortcut talks to Mara');
      await click('moveSouth');
      // Greyhaven's east exit leads to the ridge; the fixed patrol is four steps east.
      for (let step = 0; step < 6; step++) await click('moveEast');
      assert.equal((await state()).map.zoneId, 'ridge_road');
      for (let step = 0; step < 4; step++) await click('moveEast');
      assert.equal((await state()).scene, 'combat');
      // The earned Ridge fight must keep command labels and shortcut hints inside buttons.
      {
        const beforeLayout = await state();
        const quickBeforeLayout = await page.evaluate(() => localStorage.getItem('nothaven-save'));
        const shortcutsBeforeLayout = await page.locator('html').getAttribute('data-character-shortcuts');
        await setShortcuts(true);
        for (const scale of ['115', '130']) {
          await page.locator('[aria-controls="display-settings"]').click();
          await page.locator('[data-display-scale]').selectOption(scale);
          await page.locator('[data-display-done]').click();
          const commands = page.locator('.command-grid .command-button');
          assert.deepEqual(await commands.evaluateAll(nodes => nodes.map(node =>
            [node.dataset.action, node.dataset.arg || ''])), [
            ['burst', ''], ['attack', ''], ['menu', 'skills'], ['menu', 'items'],
            ['menu', 'tactics'], ['defend', ''], ['flee', ''],
          ], 'all seven native commands remain present, including disabled commands');
          const geometry = await commands.evaluateAll(nodes => nodes.map(node => {
            const r = node.getBoundingClientRect();
            const inside = rect => rect.width > 0 && rect.height > 0
              && rect.left >= r.left - 1 && rect.right <= r.right + 1
              && rect.top >= r.top - 1 && rect.bottom <= r.bottom + 1;
            const label = node.querySelector(':scope > span');
            const hint = node.querySelector('.key-hint');
            const range = document.createRange();
            if (label) range.selectNodeContents(label);
            const glyphs = label ? [...range.getClientRects()] : [];
            return {
              action: node.dataset.action, arg: node.dataset.arg || '',
              button: r.left >= 0 && r.right <= innerWidth + 1 && r.height >= 44
                && node.scrollWidth <= node.clientWidth + 1,
              label: Boolean(label) && inside(label.getBoundingClientRect())
                && glyphs.length > 0 && glyphs.every(inside),
              hint: Boolean(hint) && getComputedStyle(hint).display !== 'none'
                && inside(hint.getBoundingClientRect()),
            };
          }));
          assert.equal(geometry.length, 7);
          assert.ok(geometry.every(row => row.button && row.label && row.hint),
            `command labels and hints fit at ${width}px/${scale}%: ${JSON.stringify(geometry)}`);
          assert.deepEqual(await state(), beforeLayout, 'layout preferences must preserve the whole fight');
          assert.equal(await page.evaluate(() => localStorage.getItem('nothaven-save')), quickBeforeLayout);
          await fit(`combat-command-${scale}`);
        }
        await page.locator('[aria-controls="display-settings"]').click();
        await page.locator('[data-display-scale]').selectOption('100');
        await page.locator('[data-display-done]').click();
        await setShortcuts(shortcutsBeforeLayout !== 'off');
        assert.deepEqual(await state(), beforeLayout);
        assert.equal(await page.evaluate(() => localStorage.getItem('nothaven-save')), quickBeforeLayout);
      }
      await fit('combat');
      const beforeCommands = await state();
      assert.equal(await page.locator('[data-action="burst"]').isDisabled(), true);
      for (const key of ['b', 'Shift+a', 'Control+a']) {
        await page.keyboard.press(key);
        assert.deepEqual(await state(), beforeCommands, `${key}: unavailable/modified shortcut acted`);
      }
      await page.locator('[aria-controls="display-settings"]').click();
      await page.keyboard.press('a');
      assert.deepEqual(await state(), beforeCommands, 'display settings must block combat shortcuts');
      await page.locator('[data-display-done]').click();
      await page.keyboard.press('s');
      assert.ok(await page.locator('[data-action="skill"]').count() > 0);
      assert.deepEqual(await state(), beforeCommands, 'opening skills must not take a turn');
      // The earned level-one fight previews future skills without activating them.
      {
        const quickBefore = await page.evaluate(() => localStorage.getItem('nothaven-save'));
        const upcoming = await page.evaluate(async () => {
          const { SKILLS, SKILL_UNLOCKS } = await import('/src/combat/rules.js');
          const level = window.game.state.party[0].level;
          return Object.entries(SKILL_UNLOCKS).filter(([, unlock]) => unlock > level)
            .sort((a, b) => a[1] - b[1])
            .map(([id, unlock]) => ({ name: SKILLS[id].name, unlock, description: SKILLS[id].description }));
        });
        assert.equal((await state()).party[0].level, 1);
        assert.equal(upcoming.length, 13);
        const disclosure = page.locator('.locked-skills');
        for (const scale of ['115', '130']) {
          await page.locator('[aria-controls="display-settings"]').click();
          await page.locator('[data-display-scale]').selectOption(scale);
          await page.locator('[data-display-done]').click();
          assert.equal(await disclosure.getAttribute('open'), null);
          const summary = disclosure.locator('summary');
          assert.equal(await summary.textContent(), 'Upcoming skills (13)');
          const summaryFit = await summary.evaluate(node => {
            const r = node.getBoundingClientRect(), range = document.createRange();
            range.selectNodeContents(node);
            return r.height >= 44 && r.left >= 0 && r.right <= innerWidth + 1
              && node.scrollWidth <= node.clientWidth + 1
              && [...range.getClientRects()].every(g => g.left >= r.left - 1 && g.right <= r.right + 1
                && g.top >= r.top - 1 && g.bottom <= r.bottom + 1);
          });
          assert.equal(summaryFit, true, `upcoming-skills summary has a 44px target and fitting text at ${width}px/${scale}%`);
          await summary.click();
          assert.equal(await disclosure.getAttribute('open'), '');
          const cards = await disclosure.locator('button').evaluateAll(nodes => nodes.map(node => {
            const r = node.getBoundingClientRect();
            return { disabled: node.disabled, action: node.dataset.action, arg: node.dataset.arg,
              text: node.textContent.replace(/\s+/g, ' ').trim(), ranges: node.querySelectorAll('.damage-range').length,
              keys: node.querySelectorAll('kbd').length,
              fits: r.height >= 44 && r.left >= 0 && r.right <= innerWidth + 1 && node.scrollWidth <= node.clientWidth + 1 };
          }));
          assert.equal(cards.length, upcoming.length);
          cards.forEach((card, i) => {
            assert.equal(card.disabled, true); assert.equal(card.action, ''); assert.equal(card.arg, '');
            assert.equal(card.ranges, 0); assert.equal(card.keys, 0); assert.equal(card.fits, true);
            assert.ok(card.text.includes(upcoming[i].name) && card.text.includes(`Lv ${upcoming[i].unlock}`)
              && card.text.includes(upcoming[i].description), `upcoming skill ${i} matches the catalog in unlock order`);
          });
          assert.equal(await page.locator('[data-action="skill"]').count(), 2);
          await page.keyboard.press('3');
          assert.deepEqual(await state(), beforeCommands, 'opening upcoming skills or pressing an unused digit is free');
          assert.equal(await page.evaluate(() => localStorage.getItem('nothaven-save')), quickBefore);
          await fit(`upcoming-skills-${scale}`);
          await summary.click();
          assert.equal(await disclosure.getAttribute('open'), null);
          assert.deepEqual(await state(), beforeCommands);
        }
        await page.locator('[aria-controls="display-settings"]').click();
        await page.locator('[data-display-scale]').selectOption('100');
        await page.locator('[data-display-done]').click();
        assert.deepEqual(await state(), beforeCommands);
        assert.equal(await page.evaluate(() => localStorage.getItem('nothaven-save')), quickBefore);
      }
      await fit('combat-skills');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('[data-action="attack"]').count(), 1);
      await page.keyboard.press('i');
      assert.ok(await page.locator('[data-action="item"]').count() > 0);
      assert.deepEqual(await state(), beforeCommands, 'opening items must not take a turn');
      await fit('combat-items');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('[data-action="attack"]').count(), 1);
      assert.deepEqual(await state(), beforeCommands, 'closing command menus must not take a turn');
      await setShortcuts(false);
      const beforeDisabledCombat = await state();
      for (const key of ['a', 's', 'i', 'd', 'f', 'b', 'c']) {
        await page.keyboard.press(key);
        assert.deepEqual(await state(), beforeDisabledCombat, `${key}: opted-out combat shortcut acted`);
        assert.equal(await page.locator('[data-action="attack"]').count(), 1, `${key}: opted-out shortcut changed menus`);
      }
      assert.equal(await page.locator('[data-action="attack"] .key-hint').isVisible(), false);
      for (const [menu, action] of [['skills', 'skill'], ['items', 'item']]) {
        await click('menu', menu);
        assert.equal(await page.locator(`[data-action="${action}"]`).first().isEnabled(), true);
        for (const key of ['1', 'Numpad1']) {
          await page.keyboard.press(key);
          assert.deepEqual(await state(), beforeDisabledCombat, `${key}: opted-out ${menu} shortcut acted`);
          assert.ok(await page.locator(`[data-action="${action}"]`).count() > 0);
        }
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('[data-action="attack"]').count(), 1, 'Escape still closes menus');
        assert.deepEqual(await state(), beforeDisabledCombat);
      }
      await fit('combat-shortcuts-off');
      await page.locator('[data-action="attack"]').focus();
      await page.keyboard.press('Enter');
      assert.ok((await state()).combat.enemy.hp < beforeDisabledCombat.combat.enemy.hp, 'native Attack still works');
      // A genuinely purchased ration previews immediate healing, not the enemy reply.
      {
        const beforeItem = await state();
        const itemQuick = await page.evaluate(() => localStorage.getItem('nothaven-save'));
        assert.equal(beforeItem.party.length, 1, 'this earned fixture is solo Wren');
        assert.equal(beforeItem.party[0].name, 'Wren');
        assert.equal(beforeItem.party[0].maxHp, 30);
        assert.ok(beforeItem.party[0].hp > 0 && beforeItem.party[0].hp < 30, 'real enemy damage creates healing room');
        assert.equal(beforeItem.inventory.find(item => item.id === 'rations').qty, 3);
        // Bare level-one Wren has a 30 HP cap; Trail Rations restore at most 10 HP.
        const expectedHeal = Math.min(10, 30 - beforeItem.party[0].hp);
        const ration = page.locator('[data-action="item"][data-arg="rations"]');
        const checkPreview = async (snapshot, healing, qty) => {
          assert.equal(await page.locator('[data-action="item"]').count(), 1);
          assert.equal(await ration.locator('.item-use-preview').textContent(), `On Wren now: +${healing} HP.`);
          assert.equal(await ration.locator('.command-card__meta strong').textContent(), `×${qty}`);
          assert.equal(await page.locator('[data-action="itemTarget"]').count(), 1);
          assert.equal(await page.locator('[data-action="itemTarget"][data-arg="0"]').getAttribute('aria-pressed'), 'true');
          assert.equal(await page.locator('[data-action="itemTarget"]').isEnabled(), true);
          assert.ok((await page.locator('.item-recipient-note').allTextContents()).includes(
            'Preview shows immediate restoration before allies act and the normal enemy reply, not end-of-turn totals.'));
          assert.deepEqual(await state(), snapshot, 'preview and device controls preserve the whole earned journey');
          assert.equal(await page.evaluate(() => localStorage.getItem('nothaven-save')), itemQuick);
        };
        await click('menu', 'items');
        await checkPreview(beforeItem, expectedHeal, 3);
        for (const scale of ['115', '130']) {
          await page.locator('[aria-controls="display-settings"]').click();
          await page.locator('[data-display-scale]').selectOption(scale);
          await page.locator('[data-display-done]').click();
          for (const hints of [true, false]) {
            await setShortcuts(hints);
            await checkPreview(beforeItem, expectedHeal, 3);
            const geometry = await ration.evaluate(button => {
              const box = button.getBoundingClientRect();
              const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
              let node, glyphsFit = true;
              while ((node = walker.nextNode())) {
                if (!node.textContent.trim() || !node.parentElement.getClientRects().length) continue;
                const range = document.createRange(); range.selectNodeContents(node);
                for (const r of range.getClientRects()) glyphsFit &&= r.left >= box.left - 1 && r.right <= box.right + 1
                  && r.top >= box.top - 1 && r.bottom <= box.bottom + 1 && r.left >= 0 && r.right <= innerWidth + 1;
              }
              return { fits: box.left >= 0 && box.right <= innerWidth + 1 && box.height >= 44 && glyphsFit };
            });
            assert.equal(geometry.fits, true, `earned ration card fits ${width}px/${scale}%/hints ${hints}`);
            await fit(`earned-item-preview-${scale}-${hints ? 'on' : 'off'}`);
          }
        }
        await page.keyboard.press('Escape');
        assert.deepEqual(await state(), beforeItem, 'closing the preview is free');
        await click('menu', 'items');
        await checkPreview(beforeItem, expectedHeal, 3);
        await page.locator('[aria-controls="display-settings"]').click();
        await page.locator('[data-display-scale]').selectOption('100');
        await page.locator('[data-display-done]').click();
        await setShortcuts(false);
        await checkPreview(beforeItem, expectedHeal, 3);
        await click('item', 'rations');
        const afterItem = await state();
        assert.equal(afterItem.inventory.find(item => item.id === 'rations').qty, 2);
        assert.equal(afterItem.combat.turn, beforeItem.combat.turn + 1);
        assert.equal(afterItem.combat.enemy.hp, beforeItem.combat.enemy.hp, 'solo item use does not attack');
        const itemLines = afterItem.combat.log.slice(beforeItem.combat.log.length);
        assert.ok(itemLines.some(line => line.startsWith('Wren: Trail Rations:') && line.includes(`restored ${expectedHeal} hp`)),
          `immediate item log matches preview: ${JSON.stringify(itemLines)}`);
        assert.ok(afterItem.party[0].hp < beforeItem.party[0].hp + expectedHeal, 'ordinary enemy reply follows immediate healing');
        assert.equal(await page.evaluate(() => localStorage.getItem('nothaven-save')), itemQuick);
        await click('menu', 'items');
        await checkPreview(afterItem, Math.min(10, 30 - afterItem.party[0].hp), 2);
        await page.keyboard.press('Escape');
        assert.deepEqual(await state(), afterItem, 'reopening the updated preview is free');
      }
      await setShortcuts(true);
      for (let turn = 0; turn < 40 && !(await state()).combat.over; turn++) await page.keyboard.press('a');
      assert.equal((await state()).combat.over, 'victory');
      // This receipt was earned through the original solo Ridge route, not injected.
      {
        const victory = await state();
        const quick = await page.evaluate(() => localStorage.getItem('nothaven-save'));
        assert.equal(victory.combat.enemy.id, 'ridge_bandit');
        assert.equal(victory.party.length, 1);
        assert.deepEqual(victory.combat.rewards, { xp: 10, gold: 9, items: [] });
        assert.equal(victory.gold, beforeCommands.gold + 9);
        assert.equal(victory.party[0].xp, beforeCommands.party[0].xp + 10);
        const expectedInventory = structuredClone(beforeCommands.inventory);
        expectedInventory.find(item => item.id === 'rations').qty--;
        assert.deepEqual(victory.inventory, expectedInventory, 'only the actually used ration leaves the inventory');
        const receipt = page.locator('.combat-outcome .battle-rewards');
        const unchangedReceipt = async () => {
          assert.equal(await receipt.count(), 1);
          assert.equal(await receipt.textContent(), '+10 XP · +9 gold');
          assert.equal((await receipt.textContent()).includes('Found:'), false, 'the retained RNG earns no loot');
          assert.deepEqual(await state(), victory, 'reading rewards must not pay them again');
          assert.equal(await page.evaluate(() => localStorage.getItem('nothaven-save')), quick);
          assert.equal(await page.locator('[data-action="finish"]').isEnabled(), true);
        };
        await unchangedReceipt();
        for (const scale of ['115', '130']) {
          await page.locator('[aria-controls="display-settings"]').click();
          await page.locator('[data-display-scale]').selectOption(scale);
          await page.locator('[data-display-done]').click();
          for (const hints of [true, false]) {
            await setShortcuts(hints);
            await unchangedReceipt();
            const fits = await receipt.evaluate(node => {
              const box = node.getBoundingClientRect();
              const range = document.createRange();
              range.selectNodeContents(node);
              const glyphs = [...range.getClientRects()];
              return box.left >= 0 && box.right <= innerWidth + 1 && glyphs.length > 0
                && glyphs.every(r => r.left >= box.left - 1 && r.right <= box.right + 1
                  && r.top >= box.top - 1 && r.bottom <= box.bottom + 1);
            });
            assert.equal(fits, true, `earned reward text fits ${width}px/${scale}%/hints ${hints}`);
            assert.equal(await page.locator('[data-action="finish"]').evaluate(node => {
              const r = node.getBoundingClientRect();
              return r.height >= 44 && r.left >= 0 && r.right <= innerWidth + 1;
            }), true);
            await fit(`earned-victory-rewards-${scale}-${hints ? 'on' : 'off'}`);
          }
        }
        await page.locator('[aria-controls="display-settings"]').click();
        await page.locator('[data-display-scale]').selectOption('100');
        await page.locator('[data-display-done]').click();
        await setShortcuts(true);
        await unchangedReceipt();
      }
      assert.match(await page.locator('.battle-summary').innerText(), /\d+ rounds? · \d+ damage dealt · \d+ damage taken/);
      await fit('victory');
      const beforeChronicle = await state();
      assert.ok(beforeChronicle.combat.log.length > 8, 'earned fight retains more than the live-log window');
      await page.locator('.battle-chronicle summary').click();
      // Storage retains typed round markers; the UI displays their text.
      const rawChronicle = beforeChronicle.combat.log;
      const roundLines = rawChronicle.filter(line => line.startsWith('::round::'));
      assert.deepEqual(roundLines,
        ['::round::Round 1', '::round::Round 2', '::round::Round 3', '::round::Round 4', '::round::Round 5'],
        'earned five-action fight has exactly one ordered marker per action');
      assert.deepEqual(await page.locator('.battle-chronicle__list li').allTextContents(),
        rawChronicle.map(line => line.startsWith('::round::') ? line.slice('::round::'.length) : line));
      assert.deepEqual(await page.locator('.battle-chronicle__list .combat-log__round-marker').allTextContents(),
        ['Round 1', 'Round 2', 'Round 3', 'Round 4', 'Round 5']);
      assert.deepEqual(await state(), beforeChronicle, 'reading the full chronicle must not change state');
      await fit('battle-chronicle');
      await setShortcuts(false);
      const beforeFinish = await state();
      assert.equal(await page.locator('[data-action="finish"]').isEnabled(), true);
      await page.keyboard.press('c');
      assert.deepEqual(await state(), beforeFinish, 'opted-out Finish must not leave a resolved battle');
      await setShortcuts(true);
      await page.keyboard.press('c');
      // ridge_patrol carries a one-time spoils pool: Finish routes to the
      // pick, and leaving them continues to explore without granting anything.
      assert.equal((await state()).scene, 'rewardChoice', 'pooled ridge_patrol victory offers the one-time spoils pick');
      assert.match(await page.locator('#app').innerText(), /Victory spoils/);
      assert.deepEqual(await page.locator('.reward-option').allTextContents(),
        ['Take Linen Bandage ×2', 'Take Scrap Metal ×2', 'Take Storm Tonic']);
      assert.equal(await page.locator('[data-action="skip"]').count(), 1);
      await click('skip');
      assert.equal((await state()).scene, 'explore');
      assert.equal((await state()).combat, null);
      assert.equal((await state()).gold, beforeFinish.gold, 'Finish does not repay gold');
      assert.equal((await state()).party[0].xp, beforeFinish.party[0].xp, 'Finish does not repay XP');
      assert.deepEqual((await state()).inventory, beforeFinish.inventory, 'Finish does not duplicate loot');
      assert.equal((await state()).map.clearedEncounters.ridge_patrol, true);
      await click('save');
      const saved = await state();
      await page.reload(); await click('continue');
      assert.equal((await state()).scene, 'explore');
      assert.deepEqual((await state()).story, saved.story);
      assert.deepEqual((await state()).party, saved.party);
      assert.equal((await state()).gold, saved.gold);
      assert.equal((await state()).map.clearedEncounters.ridge_patrol, true);
      const beforeJournal = await state();
      const journalQuick = await page.evaluate(() => localStorage.getItem('nothaven-save'));
      await click('openJournal');
      const journalState = await state();
      assert.deepEqual({ ...journalState, scene: 'explore' }, beforeJournal);
      assert.match(await page.locator('main').innerText(), /Ridge Bandit/);
      assert.equal(await page.locator('[data-action="compareFoe"]').count(), 1, 'only the earned foe can be compared');
      assert.equal(await page.locator('.comparison-card').count(), 0);
      await click('compareFoe', 'ridge_bandit');
      assert.equal(await page.locator('.comparison-card[data-comparison-enemy="ridge_bandit"]').count(), 1);
      assert.equal(await page.locator('.bestiary-entry [data-action="removeComparedFoe"][data-arg="ridge_bandit"]').getAttribute('aria-pressed'), 'true');
      assert.deepEqual(await state(), journalState, 'comparison must not change progress');
      const journalCatalogue = await page.evaluate(async () => {
        const { ENEMIES } = await import('/src/data/enemies.js');
        return Object.values(ENEMIES).map(foe => ({ id: foe.id, name: foe.name, boss: Boolean(foe.boss) }));
      });
      assert.deepEqual(Object.keys(journalState.bestiary).filter(id => journalState.bestiary[id] > 0), ['ridge_bandit']);
      const journalOverview = await page.locator('.bestiary-overview').textContent();
      const journalTray = await page.locator('.bestiary-comparison').textContent();
      for (const scale of ['115', '130']) {
        await page.locator('[aria-controls="display-settings"]').click();
        await page.locator('[data-display-scale]').selectOption(scale);
        await page.locator('[data-display-done]').click();
        await fit(`earned-comparison-text-${scale}`);
        assert.deepEqual(await state(), journalState);
        const journalUnchanged = async () => {
          assert.deepEqual(await state(), journalState, 'Journal controls must preserve the whole journey');
          assert.equal(await page.evaluate(() => localStorage.getItem('nothaven-save')), journalQuick);
          assert.equal(await page.locator('.bestiary-overview').textContent(), journalOverview);
          assert.equal(await page.locator('.bestiary-comparison').textContent(), journalTray);
        };
        const journalRows = async (filter, query = '') => {
          const shown = journalCatalogue.filter(foe =>
            (filter === 'all' || (filter === 'bosses' ? foe.boss : !foe.boss))
            && (!query || (foe.id === 'ridge_bandit' && foe.name.toLowerCase().includes(query.toLowerCase()))));
          assert.equal(await page.locator('.bestiary-list > li').count(), shown.length);
          assert.deepEqual(await page.locator('.bestiary-list [data-enemy]').evaluateAll(nodes => nodes.map(node => node.dataset.enemy)),
            shown.filter(foe => foe.id === 'ridge_bandit').map(foe => foe.id));
          assert.equal(await page.locator('.bestiary-list .unknown').count(), shown.filter(foe => foe.id !== 'ridge_bandit').length);
          assert.equal(await page.locator('.bestiary-list .unknown small').count(), shown.filter(foe => foe.id !== 'ridge_bandit' && foe.boss).length);
          assert.equal(await page.locator('.bestiary-tools [role="status"]').textContent(), `Showing ${shown.length} of ${journalCatalogue.length} foes.`);
          assert.equal(await page.locator(`[data-action="bestiaryFilter"][data-arg="${filter}"]`).getAttribute('aria-pressed'), 'true');
          await journalUnchanged();
        };
        const journalSearch = async query => {
          await page.locator('#bestiary-search').fill(query);
          await click('searchBestiary');
          assert.equal(await page.locator('#bestiary-search').inputValue(), query.trim().slice(0, 120));
          await journalUnchanged();
        };
        const journalFit = async label => {
          await fit(label);
          const controls = await page.locator('.bestiary-tools button,.bestiary-tools input').evaluateAll(nodes => nodes.map(node => {
            const r = node.getBoundingClientRect();
            return r.left >= 0 && r.right <= innerWidth + 1 && r.height >= 44
              && (node.tagName === 'INPUT' || node.scrollWidth <= node.clientWidth + 1);
          }));
          assert.equal(controls.length, 13);
          assert.deepEqual(await page.locator('.bestiary-tools button:not([data-action="bestiaryElementFilter"]),.bestiary-tools input')
            .evaluateAll(nodes => nodes.map(node => node.dataset.action || node.id)),
          ['bestiaryFilter', 'bestiaryFilter', 'bestiaryFilter', 'bestiary-search', 'searchBestiary', 'clearBestiarySearch']);
          assert.deepEqual(await page.locator('[data-action="bestiaryElementFilter"]')
            .evaluateAll(nodes => nodes.map(node => [node.dataset.arg, node.getAttribute('aria-pressed')])),
          [['all', 'true'], ['fire', 'false'], ['ice', 'false'], ['lightning', 'false'],
            ['water', 'false'], ['earth', 'false'], ['untyped', 'false']]);
          assert.ok(controls.every(Boolean), 'Journal controls and button text fit; the single-line input may scroll internally');
        };
        for (const filter of ['bosses', 'regular', 'all']) {
          await click('bestiaryFilter', filter); await journalRows(filter);
        }
        await journalSearch('  RiDgE BaNdIt  '); await journalRows('all', 'ridge bandit');
        await click('bestiaryFilter', 'bosses'); await journalRows('bosses', 'ridge bandit');
        assert.equal(await page.locator('.comparison-card').count(), 1, 'zero catalogue results retain the earned comparison');
        await journalFit(`earned-journal-search-${scale}`);
        await click('clearBestiarySearch'); await journalRows('bosses');
        assert.equal(await page.locator('#bestiary-search').inputValue(), '');
        await click('bestiaryFilter', 'all');
        const hiddenFoe = journalCatalogue.find(foe => foe.id !== 'ridge_bandit');
        assert.ok(hiddenFoe);
        for (const query of [hiddenFoe.name, '???', 'ridge_bandit']) {
          await journalSearch(query); await journalRows('all', query);
          assert.equal(await page.locator('.bestiary-list > li').count(), 0, 'unknown names, placeholders and raw IDs cannot be searched');
        }
        const longJournalQuery = 'x'.repeat(120);
        await journalSearch(longJournalQuery); await journalRows('all', longJournalQuery);
        await journalFit(`earned-journal-long-${scale}`);
        await journalSearch('\"><img src=x onerror=alert(1)>');
        await journalRows('all', '\"><img src=x onerror=alert(1)>');
        assert.equal(await page.locator('#app img[src=x]').count(), 0, 'query markup must not create elements');
        await click('clearBestiarySearch'); await journalRows('all');
        assert.equal(await page.locator('#bestiary-search').inputValue(), '');
        assert.equal(await page.locator('[data-action="clearBestiarySearch"]').isDisabled(), true);
        await journalSearch('ridge bandit'); await click('bestiaryFilter', 'regular');
        await click('leave'); assert.deepEqual(await state(), beforeJournal);
        await click('openJournal');
        assert.equal(await page.locator('#bestiary-search').inputValue(), '', 'reopening resets the applied query');
        await journalRows('all');
        await journalFit(`earned-journal-reopened-${scale}`);
      }
      await page.locator('[aria-controls="display-settings"]').click();
      await page.locator('[data-display-scale]').selectOption('100');
      await page.locator('[data-display-done]').click();
      await page.locator('.comparison-card [data-action="removeComparedFoe"]').click();
      assert.equal(await page.locator('.comparison-card').count(), 0);
      assert.deepEqual(await state(), journalState);
      await click('compareFoe', 'ridge_bandit');
      assert.equal(await page.locator('.comparison-card').count(), 1);
      await click('clearComparison');
      assert.equal(await page.locator('.comparison-card').count(), 0);
      assert.deepEqual(await state(), journalState, 'Remove/re-add/Clear must not change progress');
      await fit('earned-bestiary'); await click('leave');
      assert.deepEqual(await state(), beforeJournal, 'Back must restore the whole expedition state');
      // Three manual checkpoints, earned through the same fresh-game route.
      const archiveOriginal = await state();
      const archiveKey = id => `nothaven.archive.v1.${id}`;
      const stored = key => page.evaluate(key => localStorage.getItem(key), key);
      const quickSave = await stored('nothaven-save');
      await click('openArchive');
      const archiveOpen = { ...archiveOriginal, scene: 'archive' };
      assert.deepEqual(await state(), archiveOpen);
      for (const id of ['1', '2']) {
        await click('saveArchive', id);
        assert.deepEqual(JSON.parse(await stored(archiveKey(id))).state, archiveOriginal);
      }
      const slotOne = await stored(archiveKey('1'));
      await page.locator('[aria-controls="display-settings"]').click();
      await page.locator('[data-display-scale]').selectOption('130');
      await page.locator('[data-display-done]').click();
      await fit('earned-archive-text-130');
      const archiveButtons = await page.locator('.archive-buttons button').evaluateAll(buttons => buttons.map(button => {
        const rect = button.getBoundingClientRect();
        return { left: rect.left, right: rect.right, height: rect.height, client: button.clientWidth, scroll: button.scrollWidth };
      }));
      assert.deepEqual(await page.locator('.archive-buttons button').evaluateAll(buttons =>
        buttons.map(button => [button.dataset.action, button.dataset.arg || ''])), [
        ['previewArchiveImport', '1'], ['previewArchiveImport', '2'], ['previewArchiveImport', '3'],
        ['clearArchiveImport', ''],
        ...['1', '2', '3'].flatMap(id => [
          ['saveArchive', id], ['loadArchive', id], ['exportArchive', id], ['deleteArchive', id],
        ]),
      ], 'archive exposes all original checkpoint actions and explicit transfer destinations');
      assert.equal(archiveButtons.length, 16);
      for (const button of archiveButtons) {
        assert.ok(button.left >= 0 && button.right <= width && button.height >= 44);
        assert.ok(button.scroll <= button.client + 1, 'archive control text must not overflow');
      }
      assert.deepEqual(await state(), archiveOpen);
      await click('saveArchive', '1'); await click('cancelArchive');
      assert.equal(await stored(archiveKey('1')), slotOne);
      await click('leaveArchive'); assert.deepEqual(await state(), archiveOriginal);
      await click('moveWest');
      const archiveChanged = await state();
      assert.equal(archiveChanged.scene, 'explore');
      assert.equal(archiveChanged.map.x, archiveOriginal.map.x - 1, 'ordinary westward step creates a distinct checkpoint');
      await click('openArchive'); await click('saveArchive', '3');
      assert.deepEqual(JSON.parse(await stored(archiveKey('3'))).state, archiveChanged);
      const changedOpen = await state();
      await click('loadArchive', '1'); await click('cancelArchive');
      assert.deepEqual(await state(), changedOpen);
      await click('loadArchive', '1'); await click('confirmArchive');
      assert.deepEqual(await state(), archiveOriginal, 'archive load restores the entire earned expedition');
      await click('openArchive');
      await click('saveArchive', '3'); await click('confirmArchive');
      assert.deepEqual(JSON.parse(await stored(archiveKey('3'))).state, archiveOriginal);
      const slotTwo = await stored(archiveKey('2'));
      await click('deleteArchive', '2'); await click('cancelArchive');
      assert.equal(await stored(archiveKey('2')), slotTwo);
      await click('deleteArchive', '2'); await click('confirmArchive');
      assert.equal(await stored(archiveKey('2')), null);
      assert.equal(await stored('nothaven-save'), quickSave);
      await click('leaveArchive'); assert.deepEqual(await state(), archiveOriginal);
      await page.reload(); await click('archive');
      assert.equal(await page.locator('[data-action="saveArchive"]:disabled').count(), 3);
      await click('loadArchive', '1'); await click('confirmArchive');
      assert.deepEqual(await state(), archiveOriginal, 'Title archive load restores the whole expedition');
      assert.equal(await stored('nothaven-save'), quickSave);
      // Transfer only the checkpoint earned above, never injected progress or storage.
      const journeyStorage = p => p.evaluate(() => Object.fromEntries(Object.entries(localStorage)
        .filter(([key]) => key === 'nothaven-save' || key.startsWith('nothaven.archive.'))));
      const transferFit = async p => {
        assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), width);
        const controls = await p.locator('.archive-transfer textarea, .archive-transfer button, .archive-buttons button')
          .evaluateAll(elements => elements.filter(el => !el.disabled).map(el => {
            const r = el.getBoundingClientRect();
            return { left: r.left, right: r.right, height: r.height };
          }));
        assert.ok(controls.length > 0);
        for (const r of controls) assert.ok(r.left >= 0 && r.right <= width && r.height >= 44,
          `transfer control fits and remains usable: ${JSON.stringify(r)}`);
      };
      await click('openArchive');
      const sourceLive = await state(), sourceStorage = await journeyStorage(page);
      await click('exportArchive', '1');
      const exportBox = page.locator('#archive-export-text');
      const transferText = await exportBox.inputValue(), transferEnvelope = JSON.parse(transferText);
      assert.deepEqual(transferEnvelope, JSON.parse(sourceStorage[archiveKey('1')]));
      assert.equal(await exportBox.getAttribute('readonly'), '');
      await exportBox.focus(); await exportBox.press('Control+a');
      assert.equal(await exportBox.evaluate(el => el.selectionEnd - el.selectionStart), transferText.length);
      assert.deepEqual(await journeyStorage(page), sourceStorage);
      assert.deepEqual(await state(), sourceLive);
      await transferFit(page);
      await page.locator('#archive-import-text').fill('</textarea><img src=x onerror=alert(1)>');
      await click('previewArchiveImport', '3');
      assert.equal(await page.locator('#app img[src=x]').count(), 0);
      assert.equal(await page.locator('.archive-confirm').count(), 0);
      assert.deepEqual(await journeyStorage(page), sourceStorage);
      assert.deepEqual(await state(), sourceLive);
      await click('clearArchiveImport'); await click('leaveArchive');
      assert.deepEqual(await state(), archiveOriginal);
      await click('openArchive');
      assert.equal(await page.locator('#archive-import-text').inputValue(), '');
      assert.equal(await exportBox.count(), 0);
      await click('leaveArchive');
      assert.deepEqual(await state(), archiveOriginal);

      const targetContext = await browser.newContext({ viewport: { width, height: 800 } });
      await targetContext.tracing.start({ screenshots: true, snapshots: true });
      const targetPage = await targetContext.newPage(), transferErrors = [];
      targetPage.setDefaultTimeout(10_000);
      targetPage.on('pageerror', error => transferErrors.push(error.message));
      const targetClick = (action, arg) => targetPage.locator(`[data-action="${action}"]${arg === undefined ? '' : `[data-arg="${arg}"]`}`).first().click();
      const targetState = () => targetPage.evaluate(() => structuredClone(window.game.state));
      try {
        await targetPage.addInitScript(() => { Math.random = () => 0.5; });
        await targetPage.goto(base);
        await targetPage.locator('[aria-controls="display-settings"]').click();
        await targetPage.locator('[data-display-scale]').selectOption('130');
        await targetPage.locator('[data-display-done]').click();
        await targetClick('archive');
        const titleArchive = await targetState();
        assert.deepEqual(await journeyStorage(targetPage), {}, 'receiving context starts with no journey');
        assert.equal(await targetPage.locator('[data-action="saveArchive"]:disabled').count(), 3);
        const paste = targetPage.locator('#archive-import-text');
        await paste.fill(transferText); await targetClick('previewArchiveImport', '2');
        assert.match(await targetPage.locator('.archive-confirm').innerText(), /Confirm import slot 2/);
        assert.match(await targetPage.locator('.archive-confirm').innerText(), /Incoming journey/);
        assert.deepEqual(await targetState(), titleArchive);
        assert.deepEqual(await journeyStorage(targetPage), {});
        await transferFit(targetPage);
        await targetClick('cancelArchive');
        assert.equal(await paste.inputValue(), transferText);
        assert.deepEqual(await journeyStorage(targetPage), {});
        assert.deepEqual(await targetState(), titleArchive);
        await targetClick('previewArchiveImport', '2');
        await paste.fill('{not the preview');
        await targetClick('confirmArchive');
        const importedStorage = await journeyStorage(targetPage);
        assert.deepEqual(Object.keys(importedStorage), [archiveKey('2')]);
        assert.deepEqual(JSON.parse(importedStorage[archiveKey('2')]), transferEnvelope,
          'confirmation imports the captured preview, preserving the whole checkpoint and timestamp');
        assert.deepEqual(await targetState(), titleArchive, 'import does not load or change the live journey');
        assert.equal(await paste.inputValue(), '');
        await transferFit(targetPage);
        await paste.fill(transferText); await targetClick('previewArchiveImport', '2');
        assert.deepEqual(await journeyStorage(targetPage), importedStorage);
        await targetClick('cancelArchive');
        assert.deepEqual(await journeyStorage(targetPage), importedStorage);
        assert.deepEqual(await targetState(), titleArchive);
        await targetPage.screenshot({ path: path.join(artifacts, `${width}-archive-transfer.png`), fullPage: true });
        await targetPage.reload(); await targetClick('archive');
        assert.equal(await paste.inputValue(), '');
        assert.deepEqual(await journeyStorage(targetPage), importedStorage);
        await targetClick('loadArchive', '2'); await targetClick('confirmArchive');
        assert.deepEqual(await targetState(), transferEnvelope.state, 'separate confirmed Load resumes the whole imported journey');
        assert.deepEqual(await journeyStorage(targetPage), importedStorage, 'Load never writes a quick save or another slot');
        assert.deepEqual(transferErrors, []);
      } catch (error) {
        await targetPage.screenshot({ path: path.join(artifacts, `${width}-archive-transfer-failure.png`), fullPage: true }).catch(() => {});
        console.error(`FAIL transfer ${width}px; browser errors: ${JSON.stringify(transferErrors)}`);
        throw error;
      } finally {
        try { await targetContext.tracing.stop({ path: path.join(artifacts, `${width}-archive-transfer-trace.zip`) }); }
        finally { await targetContext.close(); }
      }
      assert.deepEqual(await journeyStorage(page), sourceStorage, 'receiving context cannot alter source storage');
      assert.deepEqual(await state(), archiveOriginal);
      await page.locator('[aria-controls="display-settings"]').click();
      await page.locator('[data-display-scale]').selectOption('100');
      await page.locator('[data-display-done]').click();
      assert.deepEqual(await state(), archiveOriginal);
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}px: navigation, filters, purchase, save/reload, readonly Bag search/recipe filters/long-query wrapping, shortcut opt-out/persistence/re-enable, combat shortcuts, full chronicle, earned ridge victory/comparison and recorded-name Journal search, archive confirmations/round-trip and independent-context portable transfer; browser errors []`);
    } catch (error) {
      await page.screenshot({ path: path.join(artifacts, `${width}-failure.png`), fullPage: true }).catch(() => {});
      console.error(`FAIL ${width}px; browser errors: ${JSON.stringify(errors)}`);
      throw error;
    } finally {
      await context.tracing.stop({ path: path.join(artifacts, `${width}-trace.zip`) });
      await context.close();
    }
  }
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
