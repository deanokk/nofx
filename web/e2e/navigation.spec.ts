import { test, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// Navigation & Auth E2E Tests
//
// Tests that routing, auth guards, and page transitions work as expected.
// ---------------------------------------------------------------------------

test.describe('Navigation', () => {
  test('authenticated user can navigate to all main pages', async ({ page }) => {
    const pages = [
      { nav: 'Dashboard', expect: /dashboard|traders/ },
      { nav: 'Strategy', expect: /strategy/ },
      { nav: 'Data', expect: /data/ },
      { nav: 'Market', expect: /strategy-market|competition/ },
      { nav: 'FAQ', expect: /faq/ },
    ]

    for (const p of pages) {
      await page.goto('/')
      await page.getByRole('button', { name: p.nav }).click()
      await expect(page).toHaveURL(p.expect, { timeout: 5000 })
    }
  })

  test('strategy page is accessible without login', async ({ browser }) => {
    // Strategy page is public — no auth redirect expected
    const ctx = await browser.newContext()
    const page = await ctx.newPage()

    await page.goto('http://localhost:3000/strategy')

    await expect(page).toHaveURL(/strategy/)
    await expect(page).toHaveTitle(/NOFX/)

    await ctx.close()
  })

  test('page title contains NOFX', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/NOFX/)
  })
})
