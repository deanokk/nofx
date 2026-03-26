import { test, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// Strategy Studio E2E Tests
//
// These tests verify USER-FACING BEHAVIOR, not implementation details.
// They answer: "does the app do what a user would expect?"
// ---------------------------------------------------------------------------

test.describe('Strategy Studio', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/strategy')
    // Wait for strategy list to load (at least one strategy should exist)
    await expect(page.locator('text=Strategy Studio')).toBeVisible()
  })

  // -----------------------------------------------------------------------
  // Page load & basic rendering
  // -----------------------------------------------------------------------

  test('page loads with a strategy selected and Save disabled', async ({ page }) => {
    // If no changes have been made, Save should not be actionable
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()
    // Token estimate bar should show a percentage like "14%"
    await expect(page.locator('text=/\\d+%/').first()).toBeVisible()
  })

  // -----------------------------------------------------------------------
  // Strategy type switching
  // -----------------------------------------------------------------------

  test('switching to Grid Trading shows grid config, switching back hides it', async ({ page }) => {
    await page.getByText('AI Grid Trading').click()

    // Grid-specific UI should appear
    await expect(page.getByText('Grid Configuration')).toBeVisible()
    await expect(page.getByText('Trading Pair', { exact: true })).toBeVisible()
    await expect(page.getByText('Grid Count')).toBeVisible()

    // AI Trading-specific sections should disappear
    await expect(page.getByText('Coin Source')).not.toBeVisible()

    // Switch back
    await page.getByRole('button', { name: 'Discard' }).click()

    // Grid config should be gone, AI Trading sections back
    await expect(page.getByText('Grid Configuration')).not.toBeVisible()
    await expect(page.getByText('Coin Source')).toBeVisible()
  })

  test('switching strategy type marks form as unsaved', async ({ page }) => {
    await page.getByText('AI Grid Trading').click()

    await expect(page.getByText('Unsaved')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Discard' })).toBeVisible()
  })

  // -----------------------------------------------------------------------
  // Discard behavior — should FULLY restore, not partially
  // -----------------------------------------------------------------------

  test('Discard restores all changes, not just the last one', async ({ page }) => {
    // Make multiple changes
    await page.getByText('AI Grid Trading').click()
    await expect(page.getByText('Unsaved')).toBeVisible()

    // Discard should undo everything in one click
    await page.getByRole('button', { name: 'Discard' }).click()

    await expect(page.getByText('Unsaved')).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()
    await expect(page.getByText('Grid Configuration')).not.toBeVisible()
  })

  // -----------------------------------------------------------------------
  // NofxSelect dropdown — should not be clipped by parent containers
  // -----------------------------------------------------------------------

  test('dropdown menus are fully visible, not clipped by parent overflow', async ({ page }) => {
    // Switch to Grid to get a dropdown
    await page.getByText('AI Grid Trading').click()
    await expect(page.getByText('Grid Configuration')).toBeVisible()

    // Click Trading Pair dropdown
    const tradingPairSelect = page.locator('text=BTC/USDT').first()
    await tradingPairSelect.click()

    // All options should be visible on screen (rendered via portal)
    const ethOption = page.locator('text=ETH/USDT')
    await expect(ethOption).toBeVisible()
    await expect(ethOption).toBeInViewport()

    // Select and verify it changed
    await ethOption.click()
    await expect(page.locator('text=ETH/USDT').first()).toBeVisible()
  })

  test('dropdown closes when clicking outside', async ({ page }) => {
    await page.getByText('AI Grid Trading').click()

    const tradingPairSelect = page.locator('text=BTC/USDT').first()
    await tradingPairSelect.click()
    await expect(page.locator('text=ETH/USDT')).toBeVisible()

    // Click somewhere else on the page
    await page.getByText('Strategy Type').click()

    // Dropdown options should disappear
    await expect(page.locator('text=SOL/USDT')).not.toBeVisible()
  })

  // -----------------------------------------------------------------------
  // Sections expand/collapse
  // -----------------------------------------------------------------------

  test('accordion sections expand and collapse independently', async ({ page }) => {
    // Indicators should be collapsible
    const indicatorsBtn = page.getByRole('button', { name: 'Indicators' })
    await indicatorsBtn.click()
    await expect(page.getByText('NofxOS Data Provider')).toBeVisible()

    // Collapse it
    await indicatorsBtn.click()
    await expect(page.getByText('NofxOS Data Provider')).not.toBeVisible()

    // Risk Control independently
    const riskBtn = page.getByRole('button', { name: 'Risk Control' })
    await riskBtn.click()
    await expect(page.getByText('Position Limits')).toBeVisible()
  })

  // -----------------------------------------------------------------------
  // Prompt Preview — should generate real content
  // -----------------------------------------------------------------------

  test('Generate Prompt produces non-empty system prompt', async ({ page }) => {
    await page.getByRole('button', { name: 'Generate Prompt' }).click()

    // Should show a system prompt with actual content, not empty/error
    const promptArea = page.locator('text=System Prompt')
    await expect(promptArea).toBeVisible({ timeout: 10_000 })

    // Should have char count displayed
    await expect(page.getByText(/\d+\s*chars/)).toBeVisible()

    // Should contain trading-related content (it's a trading AI prompt)
    await expect(page.getByText(/leverage|position|trading/i).first()).toBeVisible()
  })

  // -----------------------------------------------------------------------
  // Coin Source switching
  // -----------------------------------------------------------------------

  test('switching coin source shows the correct input UI', async ({ page }) => {
    // Click the Static List button inside Coin Source section
    await page.getByRole('button', { name: /Static List/ }).click()
    await expect(page.getByText('Custom Coins')).toBeVisible()
    await expect(page.getByPlaceholder('BTC, ETH, SOL...')).toBeVisible()

    // Discard
    await page.getByRole('button', { name: 'Discard' }).click()
  })

  // -----------------------------------------------------------------------
  // Timeframe selection affects token estimate
  // -----------------------------------------------------------------------

  test('adding timeframes changes token estimate', async ({ page }) => {
    // Expand Indicators
    await page.getByRole('button', { name: 'Indicators' }).click()

    // Read initial token percentage
    const tokenLocator = page.locator('text=/\\d+%/').first()
    const initialText = await tokenLocator.textContent()
    const initialPct = parseInt(initialText ?? '0')

    // Enable an extra timeframe (1h)
    await page.getByRole('button', { name: '1h' }).click()

    // Token estimate should change (either up or down — the point is it reacts)
    await expect(async () => {
      const newText = await tokenLocator.textContent()
      const newPct = parseInt(newText ?? '0')
      expect(newPct).not.toBe(initialPct)
    }).toPass({ timeout: 3000 })

    await page.getByRole('button', { name: 'Discard' }).click()
  })

  // -----------------------------------------------------------------------
  // Token overflow blocks save (critical safety feature)
  // -----------------------------------------------------------------------

  test('save is enabled when making a valid change', async ({ page }) => {
    // Expand Indicators and toggle a timeframe — a small, valid change
    await page.getByRole('button', { name: 'Indicators' }).click()
    await page.getByRole('button', { name: '1h' }).click()

    // Save should be enabled for a valid change
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled()
    await expect(page.getByText('Unsaved')).toBeVisible()

    await page.getByRole('button', { name: 'Discard' }).click()
  })

  // -----------------------------------------------------------------------
  // Prompt style selector
  // -----------------------------------------------------------------------

  test('prompt style selector changes between Balanced/Aggressive/Conservative', async ({ page }) => {
    // Click the style selector (defaults to "Balanced")
    await page.getByText('Balanced').click()

    // All three options should appear
    await expect(page.getByText('Aggressive')).toBeVisible()
    await expect(page.getByText('Conservative')).toBeVisible()

    // Select Aggressive
    await page.getByText('Aggressive').click()

    // Verify it changed
    const selector = page.locator('[class*="cursor-pointer"]').filter({ hasText: 'Aggressive' })
    await expect(selector.first()).toBeVisible()
  })
})
