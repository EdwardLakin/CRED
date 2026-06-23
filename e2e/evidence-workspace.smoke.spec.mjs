import { test, expect } from '@playwright/test'

async function login(page) {
  await page.goto('/sign-in')
  await page.getByLabel(/email/i).fill(process.env.E2E_TEST_USER_EMAIL)
  await page.getByLabel(/password/i).fill(process.env.E2E_TEST_USER_PASSWORD)
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await expect(page.getByRole('heading', { name: /dashboard|recent sessions|complete setup/i })).toBeVisible()
}
async function openOrCreateSession(page) {
  await page.goto('/dashboard/sessions')
  const firstSession = page.locator('.session-list-grid a').first()
  if (await firstSession.isVisible().catch(() => false)) { await firstSession.click(); return }
  await page.getByRole('button', { name: /new session/i }).click()
  await expect(page.getByRole('heading', { name: /quick capture|session|what do you want/i })).toBeVisible()
}

test('Evidence Workspace browser flow is executable against seeded environment', async ({ page, context }) => {
  await login(page)
  await openOrCreateSession(page)
  await expect(page.getByRole('heading', { name: /evidence workspace overview/i })).toBeVisible()
  await page.getByRole('link', { name: /evidence library/i }).click()
  await expect(page.getByRole('heading', { name: /evidence library|source evidence/i })).toBeVisible()
  await page.getByRole('link', { name: /^timeline$/i }).click()
  await page.getByLabel(/^title$/i).fill(`E2E timeline ${Date.now()}`)
  await page.getByRole('button', { name: /create timeline event/i }).click()
  await expect(page.getByText(/E2E timeline/)).toBeVisible()
  await page.getByRole('link', { name: /^entities$/i }).click()
  await page.getByLabel(/display name|name/i).first().fill(`E2E entity ${Date.now()}`)
  await page.getByRole('button', { name: /create entity/i }).click()
  await expect(page.getByText(/E2E entity/)).toBeVisible()
  await page.getByRole('link', { name: /factual observations/i }).click()
  await page.getByLabel(/statement/i).first().fill(`E2E factual observation ${Date.now()}`)
  await page.getByRole('button', { name: /create factual observation/i }).click()
  await expect(page.getByText(/E2E factual observation/)).toBeVisible()
  await page.getByRole('link', { name: /relationship explorer/i }).click()
  await expect(page.getByRole('heading', { name: /relationship/i })).toBeVisible()
  await page.getByRole('link', { name: /^suggestions$/i }).click()
  await expect(page.getByRole('heading', { name: /suggestions/i })).toBeVisible()
  for (const action of [/accept/i, /edit and accept/i, /reject/i]) {
    const button = page.getByRole('button', { name: action }).first()
    if (await button.isVisible().catch(() => false)) await button.click()
  }
  await page.getByRole('link', { name: /^deliverables$/i }).click()
  await page.getByRole('button', { name: /generate/i }).first().click()
  const detail = page.getByRole('link', { name: /view|open/i }).first()
  if (await detail.isVisible().catch(() => false)) await detail.click()
  await expect(page.getByText(/deliverable|chronology|evidence index|observation summary/i)).toBeVisible()
  const printLink = page.getByRole('link', { name: /print/i }).first()
  if (await printLink.isVisible().catch(() => false)) {
    const printPagePromise = context.waitForEvent('page').catch(() => null)
    await printLink.click()
    const printPage = (await printPagePromise) ?? page
    await expect(printPage.getByText(/print|deliverable|chronology/i)).toBeVisible()
    await expect(printPage.getByRole('navigation', { name: /evidence workspace/i })).toHaveCount(0)
  }
})
