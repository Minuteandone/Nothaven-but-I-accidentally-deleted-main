import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

// Fresh UI-only route; fixed RNG is the only browser-side override.
// Covers one early unguarded cache, not every cache or campaign balance.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = path.join(root, "browser-artifacts", "cache-summary");
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
      const homeCache = "Zone caches: None in Greyhaven.";
      const ridgeCache =
        "Zone caches (0/1 opened): 1 ready · Nearest: Wayfarer Supply Crate (S, 2 tiles · Ready to open · 3 items)";
      const atlasHome =
        "Charted caches: None in safe haven (1 safe region charted) · Current zone: no caches";
      const atlasUnopened =
        "Charted caches: 0/1 opened across 1 region (1 unopened, 3 supply items unclaimed) · Current zone: 1 unopened (3 supply items)";
      const atlasOpened =
        "Charted caches: 1/1 opened across 1 region (all recovered) · Current zone: 1/1 opened";
      const adjacentCache =
        "Zone caches (0/1 opened): 1 ready · Nearest: Wayfarer Supply Crate (S, 1 tile · Ready to open · 3 items)";
      async function check(phase, atlas, zone) {
        const before = await snap();
        for (const scale of ["115", "130"]) {
          await page.locator('[aria-controls="display-settings"]').click();
          assert.deepEqual(await snap(), before);
          await page.locator("[data-display-scale]").selectOption(scale);
          assert.deepEqual(await snap(), before);
          await page.locator("[data-display-done]").click();
          assert.deepEqual(await snap(), before);
          for (const selector of [".frontier-atlas", ".zone-checklist"]) {
            const details = page.locator(selector);
            if (!(await details.evaluate((n) => n.open)))
              await details.locator("summary").click();
            assert.deepEqual(
              await snap(),
              before,
              `${phase}: opening ${selector} preserves whole state and raw save`,
            );
          }
          for (const [selector, literal] of [
            [".frontier-atlas__caches", atlas],
            [".zone-checklist__caches", zone],
          ]) {
            const p = page.locator(selector);
            assert.equal(await p.count(), 1);
            assert.equal(await p.innerText(), literal);
            assert.equal(
              await p.evaluate(
                (n) =>
                  n.tagName === "P" &&
                  !n.closest("[aria-live],[role=status],[role=alert]"),
              ),
              true,
            );
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
              assert.ok(r.right > r.left && r.bottom > r.top);
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
      assert.equal((await snap()).state.map.zoneId, "greyhaven");
      assert.deepEqual((await snap()).state.inventory, []);
      assert.equal((await snap()).quick, null);
      await check("home", atlasHome, homeCache);
      for (let i = 0; i < 6; i++) await click("moveEast");
      assert.equal((await snap()).state.map.zoneId, "ridge_road");
      assert.equal((await snap()).state.map.x, 1);
      assert.equal((await snap()).state.map.y, 3);
      await check("ridge", atlasUnopened, ridgeCache);
      await click("moveSouth");
      await check("adjacent", atlasUnopened, adjacentCache);
      const beforeClaim = await snap();
      assert.equal(beforeClaim.state.map.x, 1);
      assert.equal(beforeClaim.state.map.y, 4);
      await click("mapInteract", "ridge_supply_cache");
      const claimed = await snap();
      assert.deepEqual(claimed.state.inventory, [
        { id: "healing_herb", qty: 1 },
        { id: "scrap_metal", qty: 2 },
      ]);
      const expected = structuredClone(beforeClaim);
      expected.state.inventory = [
        { id: "healing_herb", qty: 1 },
        { id: "scrap_metal", qty: 2 },
      ];
      expected.state.map.completedInteractions.ridge_supply_cache = true;
      expected.state.map.log = [
        ...beforeClaim.state.map.log.slice(-19),
        "Wayfarer Supply Crate: A cedar supply crate lashed to an iron piton beside the cliff trail. (Received Healing Herb x1. Received Scrap Metal x2.)",
      ];
      assert.deepEqual(claimed, expected);
      assert.equal(
        claimed.state.map.log.length,
        beforeClaim.state.map.log.length + 1,
      );
      const opened =
        "Zone caches (1/1 opened): 1 opened · All caches in Ridge Road opened.";
      await check("collected", atlasOpened, opened);
      await click("save");
      const saved = await snap();
      assert.deepEqual(JSON.parse(saved.quick), claimed.state);
      const expectedSavedState = structuredClone(claimed.state);
      expectedSavedState.map.log = [
        ...claimed.state.map.log.slice(-19),
        "Game saved.",
      ];
      assert.deepEqual(saved.state, expectedSavedState);
      await page.reload();
      await click("continue");
      const loaded = await snap();
      assert.deepEqual(loaded.state, claimed.state);
      assert.equal(loaded.quick, saved.quick);
      await check("reloaded", atlasOpened, opened);
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${width}: fresh Home/Ridge/actual cache collection/whole SaveReload, five phases115/130 literal Atlas and zone-cache counts, bearing/distance and units, nonlive Range/document, each Display/details whole-state/raw stable; literal whole collection payment/log and Save state; errors[]; not all eight native caches or SR/balance`,
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
