import { test } from '@playwright/test'
import { openTestbed, translatePage } from '../fixtures/testbed'

const SHOT_DIR = 'research/screenshots'

test.describe('capture before/after evidence', () => {
  test('unshielded goes stale and crashes', async ({ page }) => {
    await openTestbed(page, 'none')
    await translatePage(page)
    await page.click('#btn-increment')
    await page.click('#btn-price')
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${SHOT_DIR}/unshielded.png`, fullPage: true })
  })

  test('shielded stays correct and translated', async ({ page }) => {
    await openTestbed(page, 'shield')
    await translatePage(page)
    await page.click('#btn-increment')
    await page.click('#btn-price')
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${SHOT_DIR}/shielded.png`, fullPage: true })
  })
})
