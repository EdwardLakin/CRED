import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const requiredEnv = ['E2E_BASE_URL', 'E2E_TEST_USER_EMAIL', 'E2E_TEST_USER_PASSWORD', 'E2E_ALLOW_TEST_RUN', 'E2E_PRODUCTION_URLS']
const missingEnv = requiredEnv.filter((name) => !process.env[name])
if (missingEnv.length) {
  console.error(`Playwright E2E tests are misconfigured; missing ${missingEnv.join(', ')}.`)
  process.exit(1)
}
if (process.env.E2E_ALLOW_TEST_RUN !== 'cred-e2e') {
  console.error('Refusing E2E run without E2E_ALLOW_TEST_RUN=cred-e2e.')
  process.exit(1)
}
function normalizeUrl(value = '') { try { return new URL(value.trim()).origin } catch { return value.trim().replace(/\/$/, '') } }
const baseUrl = normalizeUrl(process.env.E2E_BASE_URL)
const productionUrls = (process.env.E2E_PRODUCTION_URLS ?? '').split(',').map(normalizeUrl).filter(Boolean)
if (productionUrls.includes(baseUrl)) {
  console.error('Refusing E2E run against a URL listed in E2E_PRODUCTION_URLS.')
  process.exit(1)
}
try { require.resolve('@playwright/test') } catch { console.error('@playwright/test is not installed. Run npm install, then npx playwright install --with-deps chromium.'); process.exit(1) }
const result = spawnSync('npx', ['playwright', 'test', '--project=chromium'], { stdio: 'inherit', shell: false })
process.exit(result.status ?? 1)
