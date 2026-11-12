import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  testMatch: [
    'cloud-storage.spec.ts',
    'place-photos.spec.ts',
    'collections.spec.ts',
    'sharing.spec.ts',
    'itineraries.spec.ts',
    'live-data.spec.ts',
  ],
  outputDir: 'test-results/cloud',
  use: { baseURL: 'http://127.0.0.1:5176' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5176 --strictPort',
    url: 'http://127.0.0.1:5176',
    reuseExistingServer: false,
    env: {
      VITE_PROCESSING_API_URL: '',
      VITE_MAP_API_KEY: '',
      VITE_AWS_REGION: 'us-east-1',
      VITE_COGNITO_CLIENT_ID: 'test-client',
      VITE_STORAGE_API_URL: 'https://storage.example.test',
      VITE_ENABLE_INSTAGRAM_PREVIEW: 'true',
    },
  },
})
