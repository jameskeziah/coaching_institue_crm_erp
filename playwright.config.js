import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: '.env', quiet: true });

const appUrl = (process.env.APP_URL || 'http://localhost:5173').replace(/\/+$/, '');
const apiUrl = (process.env.API_URL || 'http://localhost:4000/api').replace(/\/+$/, '');

export default defineConfig({
  testDir: './tests/ui',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: appUrl,
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'npm run start:server',
      url: apiUrl,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'npm exec -- vite --host localhost --port 5173',
      url: appUrl,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
