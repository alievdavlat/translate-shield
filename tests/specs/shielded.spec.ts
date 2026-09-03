import { expect, test } from '@playwright/test'
import { domErrors, openTestbed, readCase, readEvents, translatePage } from '../fixtures/testbed'

test.describe('with the shield the app keeps working while translated', () => {
  test.beforeEach(async ({ page }) => {
    await openTestbed(page, 'shield')
    await translatePage(page)
  })

  test('translation is detected', async ({ page }) => {
    expect(await readEvents(page)).toContain('detected:nl')
  })

  test('a counter updates and stays translated', async ({ page }) => {
    await page.click('#btn-increment')
    await page.waitForTimeout(200)
    expect(await readCase(page, 'lights')).toContain('Er zijn 5 lampen')
  })

  test('a price updates and stays translated', async ({ page }) => {
    await page.click('#btn-price')
    await page.waitForTimeout(200)
    const total = await readCase(page, 'total')
    expect(total).toContain('29.99')
    expect(total).toContain('Totaal')
  })

  test('removing conditional text does not crash', async ({ page }) => {
    await page.click('#btn-toggle-visible')
    await page.waitForTimeout(300)
    expect(domErrors(await readEvents(page))).toEqual([])
    expect(await readCase(page, 'conditional')).not.toContain('lampen')
  })

  test('swapping a ternary does not crash', async ({ page }) => {
    await page.click('#btn-toggle-expanded')
    await page.waitForTimeout(300)
    expect(domErrors(await readEvents(page))).toEqual([])
    expect(await readCase(page, 'ternary')).toContain('4')
  })
})
