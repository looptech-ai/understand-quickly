// Playwright config for the smoke suite.
// Spins up a static file server over `site/` on port 8080 then runs the
// specs against http://localhost:8080. Fixtures under
// tests/playwright/fixtures/ are routed via Playwright's `route` API in
// the specs themselves so the suite never depends on the live registry.

const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

module.exports = defineConfig({
  testDir: path.join(__dirname, 'specs'),
  timeout: 30_000,
  expect: { timeout: 6_000 },
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never', outputFolder: path.join(__dirname, 'report') }]],
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'python3 -m http.server -d site 8080',
    url: 'http://localhost:8080/',
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
    cwd: ROOT,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit-iphone',
      use: { ...devices['iPhone 14'] },
    },
  ],
});
