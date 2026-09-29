import { defineConfig, devices } from '@playwright/test'

// Tests run against the production build on a phone-sized viewport, locally,
// in CI and in cloud sessions alike. Playwright's own Chromium is used
// (`npm run setup:browser`), unless PLAYWRIGHT_CHROMIUM_EXECUTABLE points at
// another Chromium, for machines where downloading one is not possible.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined

export default defineConfig({
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...devices['Pixel 7'],
    baseURL: 'http://localhost:4173',
    // No service worker: each test starts from a clean, uncached app.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    launchOptions: { executablePath },
  },
  projects: [{ name: 'e2e', testDir: 'e2e' }],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
