import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  testMatch: 'processing.spec.ts',
  outputDir: 'test-results/processing',
  use: { baseURL: 'http://127.0.0.1:5178' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5178 --strictPort',
    url: 'http://127.0.0.1:5178',
    reuseExistingServer: false,
    env: {
      VITE_AWS_REGION: 'us-east-1',
      VITE_COGNITO_CLIENT_ID: 'test-client',
      VITE_STORAGE_API_URL: 'https://storage.example.test',
      VITE_PROCESSING_API_URL: 'https://processing.example.test',
      VITE_ENABLE_INSTAGRAM_PREVIEW: 'true',
      VITE_MAP_API_KEY: '',
    },
  },
})
