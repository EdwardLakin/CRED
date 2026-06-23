/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  testDir: './e2e',
  timeout: 60_000,
  use: { baseURL: process.env.E2E_BASE_URL, trace: 'retain-on-failure' },
}

module.exports = config
