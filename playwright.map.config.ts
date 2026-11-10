import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  testMatch: 'map.spec.ts',
  outputDir: 'test-results/map',
  use: {
    baseURL: 'http://127.0.0.1:5177',
    reducedMotion: 'reduce',
    launchOptions: { args: ['--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5177 --strictPort',
    url: 'http://127.0.0.1:5177',
    reuseExistingServer: false,
    env: {
      VITE_MAP_API_KEY: 'test-map-key',
      VITE_AWS_REGION: 'us-east-1',
      VITE_COGNITO_CLIENT_ID: 'test-client',
      VITE_STORAGE_API_URL: 'https://storage.example.test',
    },
  },
})
