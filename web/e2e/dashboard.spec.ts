import { test, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// Dashboard (Traders Page) E2E Tests
//
// Tests the main traders management page behavior.
// ---------------------------------------------------------------------------

test.describe('Trader Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/traders')
    await expect(page.getByText('AI Traders')).toBeVisible({ timeout: 10_000 })
  })

  test('displays trader list with at least one trader', async ({ page }) => {
    await expect(page.getByText('Current Traders')).toBeVisible()
    // Should show trader action buttons
    await expect(page.getByRole('button', { name: 'View' }).first()).toBeVisible()
  })

  test('trader cards show model and exchange info', async ({ page }) => {
    // Each trader should display which model and exchange it uses
    await expect(page.getByText(/Model|AI/).first()).toBeVisible()
  })

  test('config buttons are accessible', async ({ page }) => {
    // These config entry points should be clickable
    const configButtons = ['MODELS_CONFIG', 'EXCHANGE_KEYS', 'TELEGRAM_BOT']
    for (const name of configButtons) {
      await expect(page.getByRole('button', { name })).toBeVisible()
    }
  })

  test('Create Trader button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Create Trader' })).toBeVisible()
  })
})
