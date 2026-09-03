import { expect, test } from '@playwright/test'
import { openTestbed, translatePage } from '../fixtures/testbed'

test.describe('stop() releases the page', () => {
  test('after stop the shield no longer forwards writes', async ({ page }) => {
    await openTestbed(page, 'shield')
    await translatePage(page)

    await page.click('#btn-increment')
    await page.waitForTimeout(200)
    await expect(page.locator('#lights')).toContainText('5')

    await page.evaluate(() => window.__shieldHandle?.stop())

    await page.click('#btn-increment')
    await page.waitForTimeout(200)
    await expect(page.locator('#lights')).toContainText('5')
  })

  test('stop restores the native DOM methods', async ({ page }) => {
    await openTestbed(page, 'shield')
    await translatePage(page)

    const patchedWhileRunning = await page.evaluate(
      () => !/\[native code\]/.test(String(Node.prototype.removeChild)),
    )
    expect(patchedWhileRunning).toBe(true)

    await page.evaluate(() => window.__shieldHandle?.stop())

    const patchedAfterStop = await page.evaluate(
      () => !/\[native code\]/.test(String(Node.prototype.removeChild)),
    )
    expect(patchedAfterStop).toBe(false)
  })
})
