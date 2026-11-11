import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("..", import.meta.url));
const artifacts = path.join(root, "browser-artifacts", "field-pack");
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
    const click = (name, arg) =>
      page
        .locator(
          `#app [data-action="${name}"]${arg === undefined ? "" : `[data-arg="${arg}"]`}`,
        )
        .click();
    const snap = () =>
      page.evaluate(() => ({
        state: structuredClone(window.game.state),
        quick: localStorage.getItem("nothaven-save"),
      }));
    async function check(literal, label) {
      const before = await snap();
      for (const scale of ["115", "130"]) {
        await page.locator('[aria-controls="display-settings"]').click();
        assert.deepEqual(await snap(), before);
        await page.locator("[data-display-scale]").selectOption(scale);
        assert.deepEqual(await snap(), before);
        await page.locator("[data-display-done]").click();
        assert.deepEqual(await snap(), before);
        const line = page.locator(".field-pack .field-pack__summary");
        assert.equal(await line.count(), 1);
        assert.equal(await line.textContent(), literal);
        assert.equal(await line.getAttribute("aria-live"), null);
        assert.equal(await line.getAttribute("data-action"), null);
        await line.scrollIntoViewIfNeeded();
        await page.mouse.move(0, 0);
        await page.waitForTimeout(250);
        const rects = await line.evaluate((n) => {
          const r = document.createRange();
          r.selectNodeContents(n);
          return [...r.getClientRects()].map((x) => ({
            left: x.left,
            right: x.right,
            top: x.top,
            bottom: x.bottom,
          }));
        });
        assert.ok(
          rects.length &&
            rects.every(
              (r) =>
                r.left >= -1 &&
                r.right <= width + 1 &&
                r.top >= -1 &&
                r.bottom <= 801,
            ),
        );
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth),
          width,
        );
        assert.deepEqual(await snap(), before);
        await page.screenshot({
          path: path.join(artifacts, `${width}-${label}-${scale}.png`),
          fullPage: true,
        });
        await page.screenshot({
          path: path.join(artifacts, `${width}-${label}-${scale}-viewport.png`),
        });
      }
    }
    try {
      await page.goto(base);
      await click("newGame");
      await click("explore");
      assert.deepEqual((await snap()).state.inventory, []);
      assert.equal((await snap()).quick, null);
      await check("Pack manifest: Empty · Craft ready: 0", "empty");
      await click("toTownScene");
      await click("shop");
      await click("buy", "bandage");
      await click("buy", "bandage");
      assert.equal((await snap()).state.gold, 0);
      assert.deepEqual((await snap()).state.inventory, [
        { id: "bandage", qty: 2 },
      ]);
      await click("leave");
      await click("explore");
      await check(
        "Pack manifest: 1 stack (2 items) · 2 consumables · Craft ready: 1 (Pack a Field Dressing)",
        "ready",
      );
      assert.equal(
        await page
          .locator(
            '[data-action="craftFieldItem"][data-arg="pack_field_dressing"]',
          )
          .count(),
        1,
      );
      const ready = await snap();
      await click("craftFieldItem", "pack_field_dressing");
      const crafted = await snap();
      assert.equal(crafted.state.gold, 0);
      assert.deepEqual(crafted.state.inventory, [
        { id: "field_dressing", qty: 1 },
      ]);
      assert.equal(crafted.quick, null);
      const expectedCraft = structuredClone(ready);
      expectedCraft.state.inventory = [{ id: "field_dressing", qty: 1 }];
      expectedCraft.state.map.log = [
        ...expectedCraft.state.map.log.slice(-19),
        "Crafted: Received Field Dressing x1.",
      ];
      assert.deepEqual(
        crafted,
        expectedCraft,
        "craft changes only inventory and the literal craft log",
      );
      await check(
        "Pack manifest: 1 stack (1 item) · 1 consumable · Craft ready: 0",
        "crafted",
      );
      assert.equal(
        await page.locator('[data-action="craftFieldItem"]').count(),
        0,
      );
      await click("save");
      const saved = await snap();
      assert.ok(saved.quick);
      assert.deepEqual(
        JSON.parse(saved.quick),
        crafted.state,
        "quicksave is the whole pre-save journey",
      );
      const expectedSaved = structuredClone(crafted);
      expectedSaved.quick = saved.quick;
      expectedSaved.state.map.log = [
        ...expectedSaved.state.map.log.slice(-19),
        "Game saved.",
      ];
      assert.deepEqual(
        saved,
        expectedSaved,
        "Save changes only raw quicksave and the literal saved log",
      );
      await page.reload();
      await click("continue");
      const loaded = await snap();
      assert.equal(loaded.quick, saved.quick);
      assert.deepEqual(loaded.state.inventory, crafted.state.inventory);
      assert.equal(loaded.state.gold, 0);
      assert.deepEqual(
        loaded.state,
        crafted.state,
        "Continue restores the whole pre-save journey",
      );
      await check(
        "Pack manifest: 1 stack (1 item) · 1 consumable · Craft ready: 0",
        "reloaded",
      );
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${width}: native fresh empty→buy2Bandages20→0g→craft1Dressing→SaveReload; literal manifest/readiness; whole craft/save/reload assertions;115/130 whole-state/raw-stable Display; h/v text Range+doc fit; no state/save/RNG injection; errors []`,
      );
    } catch (error) {
      await page
        .screenshot({
          path: path.join(artifacts, `${width}-failure.png`),
          fullPage: true,
        })
        .catch(() => {});
      throw error;
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
    await new Promise((resolve) => server.close(resolve));
  }
}
