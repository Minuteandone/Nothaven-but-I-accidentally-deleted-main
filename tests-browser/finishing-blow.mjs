import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

// Fresh-earned early sure-hit coverage only: UI actions, with RNG fixed at 0.5.
// No state, save, item, or coordinate grants; not late/high-roll or balance coverage.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = path.join(root, "browser-artifacts", "finishing-blow");
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
      async function check(phase, expectedText) {
        const before = await snap();
        assert.equal(before.quick, null);
        for (const scale of ["115", "130"]) {
          await page.locator('[aria-controls="display-settings"]').click();
          assert.deepEqual(await snap(), before);
          await page.locator("[data-display-scale]").selectOption(scale);
          assert.deepEqual(await snap(), before);
          await page.locator("[data-display-done]").click();
          assert.deepEqual(await snap(), before);
          for (const [selector, literal] of [
            [".finishing-blow-hint", expectedText],
          ]) {
            const p = page.locator(selector);
            assert.equal(await p.count(), 1);
            assert.equal(await p.innerText(), literal);
            assert.equal(await p.getAttribute("role"), null);
            assert.equal(await p.getAttribute("aria-live"), null);
            await p.scrollIntoViewIfNeeded();
            await page.mouse.move(0, 0);
            await page.waitForTimeout(250);
            const geometry = await p.evaluate((n) => {
              const b = n.getBoundingClientRect(),
                r = document.createRange();
              r.selectNodeContents(n);
              return {
                box: {
                  left: b.left,
                  right: b.right,
                  top: b.top,
                  bottom: b.bottom,
                },
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
                JSON.stringify({ phase, scale, selector, geometry }),
              );
            assert.equal(
              await page.evaluate(() => document.documentElement.scrollWidth),
              width,
            );
            await page.screenshot({
              path: path.join(
                artifacts,
                `${width}-${phase}-${scale}-${selector.slice(1)}.png`,
              ),
              fullPage: true,
            });
            assert.deepEqual(await snap(), before);
          }
        }
      }
      await page.goto(base);
      await click("newGame");
      await click("explore");
      for (let i = 0; i < 6; i++) await click("moveEast");
      assert.equal((await snap()).state.map.zoneId, "ridge_road");
      for (let i = 0; i < 4; i++) await click("moveEast");
      assert.equal((await snap()).state.combat.enemy.id, "ridge_bandit");
      assert.equal(await page.locator(".finishing-blow-hint").count(), 0);
      for (let i = 0; i < 3; i++) await click("attack");
      const ready = await snap();
      assert.equal(ready.state.combat.enemy.hp, 5);
      assert.equal(ready.state.combat.over, null);
      await check(
        "finish-ready",
        "Finishing blow: Power Strike will defeat Ridge Bandit (5 HP left).",
      );
      await click("menu", "skills");
      assert.deepEqual(await snap(), ready);
      await click("skill", "power_strike");
      const won = await snap();
      assert.equal(won.state.combat.over, "victory");
      assert.equal(won.state.combat.enemy.hp, 0);
      assert.equal(won.state.party[0].mp, 7);
      assert.equal(won.quick, null);
      assert.equal(await page.locator(".finishing-blow-hint").count(), 0);
      for (const scale of ["115", "130"]) {
        await page.locator('[aria-controls="display-settings"]').click();
        assert.deepEqual(await snap(), won);
        await page.locator("[data-display-scale]").selectOption(scale);
        assert.deepEqual(await snap(), won);
        await page.locator("[data-display-done]").click();
        assert.deepEqual(await snap(), won);
        assert.equal(await page.locator(".finishing-blow-hint").count(), 0);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth),
          width,
        );
      }
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${width}: fresh Ridge three Attacks→5 enemy HP;115/130 literal Power Strike finisher/Range/nonlive/whole/raw;native Power Strike→victory/7MP/no hint;resolved Display115130 whole/raw unchanged; errors[]; RNG.5 only/no grants; only early sure-hit branch, not late/high-roll native/SR`,
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
