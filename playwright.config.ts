import { defineConfig } from '@playwright/test'
export default defineConfig({
  outputDir: 'test-results/ui',
  testDir: './tests',
  testMatch: 'ui.spec.ts',
  fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
    env: { VITE_PROCESSING_API_URL: '', VITE_COGNITO_CLIENT_ID: '', VITE_STORAGE_API_URL: '', VITE_ENABLE_INSTAGRAM_PREVIEW: 'false' },
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 1024 } } },
    {
      name: 'mobile',
      use: {
        viewport: { width: 390, height: 884 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
})
