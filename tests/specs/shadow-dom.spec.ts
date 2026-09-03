import { expect, test } from '@playwright/test'
import { openTestbed, translatePage } from '../fixtures/testbed'

const readShadowValue = (page: import('@playwright/test').Page): Promise<string> =>
  page.evaluate(
    () => document.getElementById('shadow-host')?.shadowRoot?.textContent?.trim() ?? '',
  )

test.describe('a value React owns inside an open shadow root', () => {
  test('the translator reaches through the boundary', async ({ page }) => {
    await openTestbed(page, 'none')
    await translatePage(page)
    expect(await readShadowValue(page)).toContain('Er zijn 4 lampen')
  })

  test('without the shield it freezes, like any other detached node', async ({ page }) => {
    await openTestbed(page, 'none')
    await translatePage(page)
    await page.click('#btn-increment')
    await page.waitForTimeout(200)
    expect(await readShadowValue(page)).toContain('4')
  })

  test('with the shield the value updates and stays translated', async ({ page }) => {
    await openTestbed(page, 'shield')
    await translatePage(page)
    await page.click('#btn-increment')
    await page.waitForTimeout(300)

    const text = await readShadowValue(page)
    expect(text).toContain('5')
    expect(text).toContain('lampen')
  })
})
