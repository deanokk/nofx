import { test as setup, expect } from '@playwright/test'

// E2E tests require a running backend (port 8080) and a valid test account.
// Set E2E_EMAIL and E2E_PASSWORD env vars, or it defaults to the dev account.
const EMAIL = process.env.E2E_EMAIL ?? 'wuhao@vergex.trade'
const PASSWORD = process.env.E2E_PASSWORD ?? ''

setup('authenticate', async ({ page }) => {
  setup.skip(!PASSWORD, 'Set E2E_PASSWORD env var to run E2E tests')

  await page.goto('/login')
  await page.getByPlaceholder('you@example.com').fill(EMAIL)
  await page.getByPlaceholder('••••••••').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign In' }).click()

  // Should redirect to traders page after login
  await expect(page).toHaveURL(/\/traders/, { timeout: 10_000 })

  await page.context().storageState({ path: './e2e/.auth/user.json' })
})
