import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

// This short new-game smoke test is not a full campaign or balance proof.
// All progress comes from UI clicks and key presses. Evaluation only observes game state/layout;
// no game state or RNG is modified by this focused probe.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = path.join(root, "browser-artifacts", "bag-details");
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
    });
    await context.tracing.start({ screenshots: true, snapshots: true });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const click = (action, arg) =>
      page
        .locator(
          `#app [data-action="${action}"]${arg === undefined ? "" : `[data-arg="${arg}"]`}`,
        )
        .first()
        .click();
    const state = () => page.evaluate(() => structuredClone(window.game.state));
    const quick = () =>
      page.evaluate(() => localStorage.getItem("nothaven-save"));
    try {
      await page.goto(base);
      await click("newGame");
      await click("shop");
      await click("buy", "bandage");
      await click("buy", "rations");
      await click("leave");
      await click("bag");
      const bag = await state();
      assert.equal(bag.gold, 4);
      assert.deepEqual(bag.inventory, [
        { id: "bandage", qty: 1 },
        { id: "rations", qty: 1 },
      ]);
      const saved = await quick();
      assert.equal(saved, null);
      const unchanged = async () => {
        assert.deepEqual(await state(), bag);
        assert.equal(await quick(), saved);
      };
      const focus = async (id) =>
        assert.deepEqual(
          await page.evaluate(() => ({
            action: document.activeElement?.dataset.action,
            arg: document.activeElement?.dataset.arg,
          })),
          { action: "bagDetails", arg: id },
        );
      const expanded = async (selected) =>
        assert.deepEqual(
          await page
            .locator('[data-action="bagDetails"]')
            .evaluateAll((ns) =>
              ns.map((n) => [n.dataset.arg, n.getAttribute("aria-expanded")]),
            ),
          [
            ["bandage", selected === "bandage" ? "true" : "false"],
            ["rations", selected === "rations" ? "true" : "false"],
          ],
        );
      const drawer = async (text) => {
        assert.equal(await page.locator(".bag-details").count(), 1);
        assert.deepEqual(
          await page.locator(".bag-details p").allTextContents(),
          [text],
        );
      };
      for (const scale of ["115", "130"]) {
        await page.locator('[aria-controls="display-settings"]').click();
        await unchanged();
        await page.locator("[data-display-scale]").selectOption(scale);
        await unchanged();
        await page.locator("[data-display-done]").click();
        await unchanged();
        assert.equal(await page.locator(".bag-details").count(), 0);
        await expanded(null);
        await click("bagDetails", "bandage");
        await unchanged();
        await focus("bandage");
        await drawer("Buy at: Hesta's Goods — 10g each");
        await expanded("bandage");
        await page.keyboard.press("Enter");
        await unchanged();
        await focus("bandage");
        assert.equal(await page.locator(".bag-details").count(), 0);
        await expanded(null);
        await page.keyboard.press("Enter");
        await unchanged();
        await focus("bandage");
        await drawer("Buy at: Hesta's Goods — 10g each");
        await expanded("bandage");
        await click("bagDetails", "rations");
        await unchanged();
        await focus("rations");
        await drawer(
          "Buy at: Hesta's Goods · Saltmere Trading Post · Relay Outpost Stores — 6g each",
        );
        await expanded("rations");
        await page.mouse.move(0, 0);
        await page.waitForTimeout(250);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth),
          width,
        );
        const rects = await page.locator(".bag-details p").evaluateAll((ns) =>
          ns.flatMap((n) => {
            const r = document.createRange();
            r.selectNodeContents(n);
            return [...r.getClientRects()].map((b) => ({
              left: b.left,
              right: b.right,
            }));
          }),
        );
        assert.ok(
          rects.length &&
            rects.every((r) => r.left >= 0 && r.right <= width + 1),
        );
        const buttons = await page
          .locator('[data-action="bagDetails"]')
          .evaluateAll((ns) =>
            ns.map((n) => {
              const b = n.getBoundingClientRect();
              const r = document.createRange();
              r.selectNodeContents(n);
              return {
                left: b.left,
                right: b.right,
                height: b.height,
                text: [...r.getClientRects()].map((x) => ({
                  left: x.left,
                  right: x.right,
                })),
              };
            }),
          );
        assert.equal(buttons.length, 2);
        assert.ok(
          buttons.every(
            (b) =>
              b.height >= 44 &&
              b.left >= 0 &&
              b.right <= width + 1 &&
              b.text.every(
                (t) => t.left >= b.left - 1 && t.right <= b.right + 1,
              ),
          ),
        );
        await page.screenshot({
          path: path.join(artifacts, `${width}-rations-${scale}.png`),
          fullPage: true,
        });
        await click("bagDetails", "rations");
        await unchanged();
        assert.equal(await page.locator(".bag-details").count(), 0);
        await expanded(null);
        await click("bagDetails", "bandage");
        await unchanged();
        await click("leave");
        const town = await state();
        const expected = structuredClone(bag);
        expected.scene = "town";
        assert.deepEqual(town, expected);
        assert.equal(await quick(), saved);
        await click("bag");
        await unchanged();
        assert.equal(await page.locator(".bag-details").count(), 0);
        await expanded(null);
      }
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${width}: fresh bought bandage/ration; 115/130 native drawer swap/toggle/Enter focus/aria-expanded, bounded text/buttons44, whole journey and quicksave stable; errors []`,
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
          path: path.join(artifacts, `${width}-trace.zip`),
        });
      } finally {
        await context.close();
      }
    }
  }
} finally {
  try {
    if (browser) await browser.close();
  } finally {
    await new Promise((r) => server.close(r));
  }
}
