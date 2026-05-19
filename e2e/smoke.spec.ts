import { test, expect } from '@playwright/test'

test.describe('@e2e SOON Board smoke', () => {
  test('app boots and Calendar appears', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    await page.goto('/')
    await expect(page.getByText('Board')).toBeVisible()
    await expect(page.getByRole('dialog')).toBeVisible()

    expect(consoleErrors).toHaveLength(0)
  })

  // Requires live OpenF1 data — deferred network fixture
  test.skip('happy path: pick 2024 Monaco Race → markers move @network', async ({ page }) => {
    await page.goto('/')
    // Select 2024 Monaco Race from Calendar, verify driver markers animate
  })
})
