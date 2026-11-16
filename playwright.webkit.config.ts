import { defineConfig } from '@playwright/test'
import cloud from './playwright.cloud.config'

// WebKit engine coverage is not a substitute for physical iPhone testing.
export default defineConfig({
  ...cloud,
  outputDir: 'test-results/webkit',
  use: { ...cloud.use, browserName: 'webkit' },
})
