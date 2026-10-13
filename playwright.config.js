import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'tests',
  testMatch:'browser-*.spec.js',
  timeout:30000,
  retries:1,
  reporter:'list',
  use:{browserName:'chromium',headless:true}
});
