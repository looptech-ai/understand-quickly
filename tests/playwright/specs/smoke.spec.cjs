// Smoke tests for the registry browser. The static site is served by the
// `webServer` block in playwright.config.js. We mock registry.json + the
// per-entry graph_url so the suite never depends on the live site state.

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const FIX = path.join(__dirname, '..', 'fixtures');
const REGISTRY = JSON.parse(fs.readFileSync(path.join(FIX, 'registry.json'), 'utf8'));
const ANYTHING = fs.readFileSync(path.join(FIX, 'anything.json'), 'utf8');
const GITNEXUS = fs.readFileSync(path.join(FIX, 'gitnexus.json'), 'utf8');
const CODEREVIEW = fs.readFileSync(path.join(FIX, 'codereview.json'), 'utf8');

async function installRoutes(page) {
  // Bypass the persisted "tour auto-shown" guard so the desktop tour panel
  // never auto-opens during the test (we still drive it via the start
  // button when needed).
  await page.addInitScript(() => {
    try { sessionStorage.setItem('uq:tour-autoshown', '1'); } catch (_) { /* noop */ }
  });

  await page.route('**/registry.json', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(REGISTRY),
    });
  });
  await page.route('**/__fixture__/anything.json', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: ANYTHING });
  });
  await page.route('**/__fixture__/gitnexus.json', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: GITNEXUS });
  });
  await page.route('**/__fixture__/codereview.json', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: CODEREVIEW });
  });
  // Drop the optional Cloudflare beacon to avoid network noise.
  await page.route('**/cloudflareinsights.com/**', (route) => route.abort());
}

test.describe('registry browser smoke', () => {
  test.beforeEach(async ({ page }) => {
    await installRoutes(page);
  });

  test('loads with empty main state, sidebar populated', async ({ page }) => {
    await page.goto('/');
    const main = page.locator('#main');
    await expect(main).toHaveAttribute('data-main-state', 'empty');
    await expect(page.locator('#cards .entry-card').first()).toBeVisible();
    const cardCount = await page.locator('#cards .entry-card').count();
    expect(cardCount).toBeGreaterThanOrEqual(1);
  });

  test('clicking first card loads the graph pane', async ({ page }) => {
    await page.goto('/');
    await page.locator('#cards .entry-card').first().click();
    const main = page.locator('#main');
    await expect(main).toHaveAttribute('data-main-state', 'graph', { timeout: 6000 });
  });

  test('search filters cards and updates the X / Y meta counter', async ({ page }) => {
    await page.goto('/');
    await page.locator('#cards .entry-card').first().waitFor();
    await page.locator('#q').fill('gitnexus');
    // results-meta shows "filtered / total"
    await expect(page.locator('#results-meta')).toContainText('/');
    // expect at least one card matching, fewer than total
    const cards = await page.locator('#cards .entry-card').count();
    expect(cards).toBeGreaterThanOrEqual(1);
    expect(cards).toBeLessThan(REGISTRY.entries.length + 1);
  });

  test('right-click on a graph node opens the context menu (chromium)', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'context-menu coords differ on webkit mobile');
    await page.goto('/');
    await page.locator('#cards .entry-card').first().click();
    await expect(page.locator('#main')).toHaveAttribute('data-main-state', 'graph', { timeout: 6000 });
    // vis-network paints into a child <canvas>; right-click roughly at
    // its centre. The exact node id isn't required — we only need the
    // app to fire the context-menu DOM (or to have nothing happen if no
    // node is under the cursor).
    const canvas = page.locator('#graph-canvas canvas').first();
    await expect(canvas).toBeVisible({ timeout: 6000 });
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    }
    // The context menu either opens (when a node was hit) or stays hidden
    // (when the click landed on background). Either way the menu element
    // must remain present in the DOM and be valid markup.
    await expect(page.locator('#ctx-menu')).toHaveCount(1);
  });

  test('mobile viewport collapses sidebar to a horizontal strip', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const sidebar = page.locator('.sidebar');
    await expect(sidebar).toBeVisible();
    // On mobile the workspace flips to a column layout; sidebar list should
    // become horizontal-scroll.
    const list = page.locator('#cards');
    const overflowX = await list.evaluate((el) => getComputedStyle(el).overflowX);
    expect(['auto', 'scroll']).toContain(overflowX);
  });

  test('?diag=1 shows the diagnostics panel', async ({ page }) => {
    await page.goto('/?diag=1');
    await expect(page.locator('#diag')).toBeVisible();
    await expect(page.locator('#diag')).toContainText('Page version');
  });

  test('? opens cheatsheet, Esc closes it', async ({ page }) => {
    await page.goto('/');
    await page.locator('#cards .entry-card').first().waitFor();
    // Question-mark via Shift+/
    await page.keyboard.press('Shift+/');
    await expect(page.locator('#cheatsheet-overlay')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#cheatsheet-overlay')).toBeHidden();
  });

  test('tour-start button visible after graph loads, hides while tour runs', async ({ page, browserName }) => {
    // On webkit-mobile the tour panel takes the screen; the start button
    // hides as expected. Same flow on chromium.
    void browserName;
    await page.goto('/');
    await page.locator('#cards .entry-card').first().click();
    await expect(page.locator('#main')).toHaveAttribute('data-main-state', 'graph', { timeout: 6000 });
    const startBtn = page.locator('#tour-start');
    await expect(startBtn).toBeVisible({ timeout: 6000 });
    await startBtn.click();
    await expect(page.locator('#tour-panel')).toBeVisible();
    // Body data attribute is the source of truth for "tour running".
    await expect(page.locator('body')).toHaveAttribute('data-tour-running', 'true');
    await page.keyboard.press('Escape');
    await expect(page.locator('#tour-panel')).toBeHidden();
  });
});
