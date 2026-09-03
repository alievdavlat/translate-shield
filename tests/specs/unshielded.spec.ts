import { expect, test } from '@playwright/test'
import { domErrors, openTestbed, readCase, readEvents, translatePage } from '../fixtures/testbed'

test.describe('without the shield the documented failures happen', () => {
  test.beforeEach(async ({ page }) => {
    await openTestbed(page, 'none')
    await translatePage(page)
  })

  test('the translator rewrites text into font elements', async ({ page }) => {
    await expect(page.locator('#lights')).toContainText('Er zijn 4 lampen')
    expect(await page.locator('#lights font').count()).toBeGreaterThan(0)
  })

  test('a counter never updates again', async ({ page }) => {
    await page.click('#btn-increment')
    await page.waitForTimeout(200)
    expect(await readCase(page, 'lights')).toContain('4')
    expect(await readCase(page, 'lights')).not.toContain('5')
  })

  test('a price never updates again', async ({ page }) => {
    await page.click('#btn-price')
    await page.waitForTimeout(200)
    expect(await readCase(page, 'total')).toContain('19.99')
  })

  test('removing conditional text crashes', async ({ page }) => {
    await page.click('#btn-toggle-visible')
    await page.waitForTimeout(300)
    expect(domErrors(await readEvents(page)).length).toBeGreaterThan(0)
  })

  test('swapping a ternary crashes', async ({ page }) => {
    await page.click('#btn-toggle-expanded')
    await page.waitForTimeout(300)
    expect(domErrors(await readEvents(page)).length).toBeGreaterThan(0)
  })
})
