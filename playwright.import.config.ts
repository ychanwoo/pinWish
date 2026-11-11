import { defineConfig } from '@playwright/test'
export default defineConfig({
  outputDir: 'test-results/import',
  testDir: './tests', testMatch: ['instagram-import.spec.ts', 'place-confirmation.spec.ts'],
  use: { baseURL: 'http://127.0.0.1:5174' },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort', url: 'http://127.0.0.1:5174', reuseExistingServer: false, env: { VITE_PROCESSING_API_URL: '', VITE_ENABLE_INSTAGRAM_PREVIEW: 'true', VITE_COGNITO_CLIENT_ID: '', VITE_STORAGE_API_URL: '' } },
})
