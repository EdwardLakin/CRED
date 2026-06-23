import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const requiredEnv = ['E2E_BASE_URL', 'E2E_TEST_USER_EMAIL', 'E2E_TEST_USER_PASSWORD']
const missingEnv = requiredEnv.filter((name) => !process.env[name])

if (missingEnv.length) {
  console.warn(`Skipping Playwright E2E smoke tests; missing ${missingEnv.join(', ')}.`)
  process.exit(0)
}

try {
  require.resolve('@playwright/test')
} catch {
  console.warn('Skipping Playwright E2E smoke tests; @playwright/test is not installed in this environment.')
  process.exit(0)
}

const result = spawnSync('npx', ['playwright', 'test'], { stdio: 'inherit', shell: false })
process.exit(result.status ?? 1)
