import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = path.join(root, "browser-artifacts", "knockout-warning");
await mkdir(artifacts, { recursive: true });
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const relative =
      pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
    const file = path.resolve(root, relative);
    const allowed =
      ["index.html", "style.css"].includes(relative) ||
      (relative.startsWith("src/") &&
        file.startsWith(path.join(root, "src") + path.sep));
    if (!allowed) {
      res.writeHead(404);
      res.end();
      return;
    }
    const data = await readFile(file);
    const type =
      { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" }[
        path.extname(file)
      ] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

// Fresh native actions only; evaluation observes state/layout except controlled RNG.
// This covers the basic-hit warning and escaped screen, not boss balance or screen readers.
let browser;
try {
  browser = await chromium.launch({ headless: true });
  for (const width of [320, 375, 768]) {
    const context = await browser.newContext({
        viewport: { width, height: 800 },
      }),
      page = await context.newPage(),
      errors = [];
    await context.tracing.start({ screenshots: true, snapshots: true });
    page.setDefaultTimeout(10000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      Math.random = () => 0.5;
    });
    const control = (a, id) =>
      page.locator(
        `#app [data-action="${a}"]${id === undefined ? "" : `[data-arg="${id}"]`}`,
      );
    const click = (a, id) => control(a, id).click();
    const snap = () =>
      page.evaluate(() => ({
        state: structuredClone(window.game.state),
        quick: localStorage.getItem("nothaven-save"),
      }));
    try {
      await page.goto(base);
      await click("newGame");
      await click("explore");
      for (let i = 0; i < 6; i++) await click("moveEast");
      assert.equal((await snap()).state.map.zoneId, "ridge_road");
      for (let i = 0; i < 4; i++) await click("moveEast");
      assert.equal((await snap()).state.combat.enemy.id, "ridge_bandit");
      assert.equal(await page.locator(".knockout-warning").count(), 0);
      for (let i = 0; i < 13; i++) await click("defend");
      const before = await snap();
      assert.equal(before.state.party[0].hp, 4);
      assert.equal(before.state.combat.over, null);
      assert.equal(before.quick, null);
      const literal =
        "Knockout risk: A basic hit could knock out Wren (4 HP left). Heal or Defend this turn.";
      for (const scale of ["115", "130"]) {
        await page.locator('[aria-controls="display-settings"]').click();
        assert.deepEqual(await snap(), before);
        await page.locator("[data-display-scale]").selectOption(scale);
        assert.deepEqual(await snap(), before);
        await page.locator("[data-display-done]").click();
        assert.deepEqual(await snap(), before);
        const warning = page.locator(".knockout-warning");
        assert.equal(await warning.count(), 1);
        assert.equal(await warning.innerText(), literal);
        assert.equal(await warning.getAttribute("role"), null);
        assert.equal(await warning.getAttribute("aria-live"), null);
        await warning.scrollIntoViewIfNeeded();
        await page.mouse.move(0, 0);
        await page.waitForTimeout(250);
        const geometry = await warning.evaluate((n) => {
          const b = n.getBoundingClientRect(),
            r = document.createRange();
          r.selectNodeContents(n);
          return {
            box: { left: b.left, right: b.right, top: b.top, bottom: b.bottom },
            text: [...r.getClientRects()].map((v) => ({
              left: v.left,
              right: v.right,
              top: v.top,
              bottom: v.bottom,
            })),
          };
        });
        assert.ok(geometry.text.length > 0);
        for (const r of geometry.text)
          assert.ok(
            r.left >= geometry.box.left - 1 &&
              r.right <= geometry.box.right + 1 &&
              r.left >= -1 &&
              r.right <= width + 1 &&
              r.top >= geometry.box.top - 1 &&
              r.bottom <= geometry.box.bottom + 1,
          );
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth),
          width,
        );
        await page.screenshot({
          path: path.join(artifacts, `${width}-risk-${scale}.png`),
          fullPage: true,
        });
      }
      await click("menu", "skills");
      assert.deepEqual(await snap(), before);
      await click("skill", "mend");
      const healed = await snap();
      assert.equal(healed.state.party[0].hp, 12);
      assert.equal(healed.state.party[0].mp, 6);
      assert.equal(healed.state.combat.turn, before.state.combat.turn + 1);
      assert.equal(healed.state.combat.enemy.hp, before.state.combat.enemy.hp);
      assert.equal(await page.locator(".knockout-warning").count(), 0);
      assert.equal(healed.quick, null);
      assert.deepEqual(errors, []);
      for (let i = 0; i < 4; i++) await click("defend");
      assert.equal((await snap()).state.party[0].hp, 4);
      assert.equal(await page.locator(".knockout-warning").count(), 1);
      assert.equal(
        await page.locator(".knockout-warning").innerText(),
        literal,
      );
      await page.evaluate(() => {
        Math.random = () => 0.49;
      });
      await click("flee");
      const fled = await snap();
      assert.equal(fled.state.combat.over, "fled");
      assert.equal(fled.state.party[0].hp, 4);
      assert.equal(fled.quick, null);
      assert.equal(
        await page.locator(".knockout-warning").count(),
        0,
        "no action advice on escaped screen",
      );
      for (const scale of ["115", "130"]) {
        await page.locator('[aria-controls="display-settings"]').click();
        assert.deepEqual(await snap(), fled);
        await page.locator("[data-display-scale]").selectOption(scale);
        assert.deepEqual(await snap(), fled);
        await page.locator("[data-display-done]").click();
        assert.deepEqual(await snap(), fled);
        assert.equal(await page.locator(".knockout-warning").count(), 0);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth),
          width,
        );
      }
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${width}: fresh Ridge13Defend→4HP;115/130 literal/Range/nonlive/whole/raw;Mend12HP6MP clears warning;fourDefend→4HP;nativeFlee→over=fled;115/130 no warning,whole/raw stable;errors[]; RNG .5 then .49 for Flee only, no grants`,
      );
    } catch (e) {
      await page
        .screenshot({
          path: path.join(artifacts, `${width}-failure.png`),
          fullPage: true,
        })
        .catch(() => {});
      throw e;
    } finally {
      try {
        await context.tracing.stop({
          path: path.join(artifacts, `${width}.zip`),
        });
      } finally {
        await context.close();
      }
    }
  }
} finally {
  try {
    await browser?.close();
  } finally {
    await new Promise((r) => server.close(r));
  }
}
