import { test, expect } from '@playwright/test'

const configured = Boolean(process.env.E2E_BASE_URL && process.env.E2E_TEST_USER_EMAIL && process.env.E2E_TEST_USER_PASSWORD)

test.describe('CRED capture to export regression smoke', () => {
  test.skip(!configured, 'E2E_BASE_URL, E2E_TEST_USER_EMAIL, and E2E_TEST_USER_PASSWORD are required')

  test('capture, review, generate report, edit, approve, and export', async ({ page }) => {
    await page.goto(process.env.E2E_BASE_URL)
    await page.getByTestId('e2e-capture').click()
    await page.getByTestId('e2e-review').click()
    await page.getByTestId('e2e-generate-report').click()
    await page.getByTestId('e2e-edit-report').click()
    await page.getByTestId('e2e-approve-report').click()
    await page.getByTestId('e2e-export-report').click()
    await expect(page.getByText(/export|download/i)).toBeVisible()
  })
})
