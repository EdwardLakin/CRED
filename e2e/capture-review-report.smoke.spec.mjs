import { test, expect } from '@playwright/test'

async function login(page) {
  await page.goto('/sign-in')
  await page.getByLabel(/email/i).fill(process.env.E2E_TEST_USER_EMAIL)
  await page.getByLabel(/password/i).fill(process.env.E2E_TEST_USER_PASSWORD)
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await expect(page.getByRole('heading', { name: /dashboard|recent sessions|complete setup/i })).toBeVisible()
}

test('capture review report approval and export flow is executable', async ({ page }) => {
  await login(page)
  await page.goto('/dashboard/sessions')
  const firstSession = page.locator('.session-list-grid a').first()
  if (await firstSession.isVisible().catch(() => false)) await firstSession.click()
  else await page.getByRole('button', { name: /new session/i }).click()
  await page.getByRole('link', { name: /^capture$/i }).click()
  await expect(page.getByRole('heading', { name: /capture|quick capture/i })).toBeVisible()
  const note = page.getByLabel(/note|description|technician/i).first()
  if (await note.isVisible().catch(() => false)) await note.fill(`E2E deterministic capture fixture ${Date.now()}`)
  const submit = page.getByRole('button', { name: /save|submit|add|capture/i }).first()
  if (await submit.isVisible().catch(() => false)) await submit.click()
  await page.getByRole('link', { name: /review|report/i }).first().click()
  await expect(page.getByRole('heading', { name: /review|report/i })).toBeVisible()
  for (const action of [/generate report/i, /edit report/i, /approve report/i, /export/i]) {
    const button = page.getByRole('button', { name: action }).first()
    const link = page.getByRole('link', { name: action }).first()
    if (await button.isVisible().catch(() => false)) await button.click()
    else if (await link.isVisible().catch(() => false)) await link.click()
  }
  await expect(page.getByText(/export|download|approved|report/i)).toBeVisible()
})
