import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  testMatch: 'direct-place.spec.ts',
  outputDir: 'test-results/direct',
  use: { baseURL: 'http://127.0.0.1:5179' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5179 --strictPort',
    url: 'http://127.0.0.1:5179',
    reuseExistingServer: false,
    env: {
      VITE_PROCESSING_API_URL: 'https://processing.example.test',
      VITE_MAP_API_KEY: '',
      VITE_AWS_REGION: 'us-east-1',
      VITE_COGNITO_CLIENT_ID: 'test-client',
      VITE_STORAGE_API_URL: 'https://storage.example.test',
      VITE_ENABLE_INSTAGRAM_PREVIEW: 'true',
    },
  },
})
