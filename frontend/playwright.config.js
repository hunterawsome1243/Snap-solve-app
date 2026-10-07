import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

// PW_CHROMIUM lets a sandbox point at a preinstalled Chromium; on CI Playwright installs its own.
const executablePath = process.env.PW_CHROMIUM || undefined
const fakeVideo = path.resolve('e2e/.tmp/paper.y4m')

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.js',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 390, height: 844 },
    locale: 'en-US',
    acceptDownloads: true,
    permissions: ['camera'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      viewport: { width: 390, height: 844 },
      launchOptions: {
        executablePath,
        // a fake camera that plays a looping video of a skewed sheet of paper
        args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${fakeVideo}`],
      },
    },
  }],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
