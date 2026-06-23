import { test, expect } from '@playwright/test'

const configured = Boolean(process.env.E2E_BASE_URL && process.env.E2E_TEST_USER_EMAIL && process.env.E2E_TEST_USER_PASSWORD)

test.describe('Evidence Workspace critical browser smoke', () => {
  test.skip(!configured, 'E2E_BASE_URL, E2E_TEST_USER_EMAIL, and E2E_TEST_USER_PASSWORD are required')

  test('create evidence workspace artifacts, suggestions, and printable deliverable', async ({ page }) => {
    await page.goto(process.env.E2E_BASE_URL)
    await expect(page.getByRole('link', { name: /sessions|dashboard/i })).toBeVisible()
    await page.getByTestId('e2e-open-or-create-session').click()
    await page.getByTestId('e2e-add-evidence').click()
    await page.getByTestId('e2e-evidence-library').click()
    await page.getByTestId('e2e-create-timeline-event').click()
    await page.getByTestId('e2e-create-entity').click()
    await page.getByTestId('e2e-create-factual-observation').click()
    await page.getByTestId('e2e-create-relationship').click()
    await page.getByTestId('e2e-ai-suggestion-suggested').click()
    await page.getByRole('button', { name: /accept/i }).click()
    await page.getByTestId('e2e-ai-suggestion-edit').click()
    await page.getByRole('button', { name: /edit and accept/i }).click()
    await page.getByTestId('e2e-ai-suggestion-reject').click()
    await page.getByRole('button', { name: /reject/i }).click()
    await page.getByTestId('e2e-generate-deliverable').click()
    await page.getByTestId('e2e-deliverable-detail').click()
    await page.getByTestId('e2e-printable-deliverable').click()
    await expect(page.getByText(/printable|deliverable/i)).toBeVisible()
  })
})
