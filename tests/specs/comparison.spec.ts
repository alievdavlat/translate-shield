import { writeFileSync, mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import {
  domErrors,
  openTestbed,
  readEvents,
  translatePage,
  type Protection,
} from '../fixtures/testbed'

interface Measurement {
  protection: Protection
  counterAfterIncrement: string
  totalAfterRaise: string
  appAliveAfterHide: boolean
  conditionalAfterHide: string
  ternaryAfterToggle: string
  domErrors: string[]
}

const REPORT_DIR = 'research'
const results: Measurement[] = []

const readIfPresent = async (page: Page, id: string): Promise<string> => {
  const locator = page.locator(`#${id}`)
  if ((await locator.count()) === 0) return '<gone: app crashed>'
  return locator.innerText()
}

const measure = async (page: Page, protection: Protection): Promise<Measurement> => {
  await openTestbed(page, protection)
  await translatePage(page)

  await page.click('#btn-increment')
  await page.click('#btn-price')
  await page.waitForTimeout(200)
  const counterAfterIncrement = await readIfPresent(page, 'lights')
  const totalAfterRaise = await readIfPresent(page, 'total')

  await page.click('#btn-toggle-visible')
  await page.waitForTimeout(300)

  const appAliveAfterHide = (await page.locator('#btn-toggle-expanded').count()) > 0
  if (appAliveAfterHide) {
    await page.click('#btn-toggle-expanded')
    await page.waitForTimeout(300)
  }

  return {
    protection,
    counterAfterIncrement,
    totalAfterRaise,
    appAliveAfterHide,
    conditionalAfterHide: await readIfPresent(page, 'conditional'),
    ternaryAfterToggle: await readIfPresent(page, 'ternary'),
    domErrors: domErrors(await readEvents(page)),
  }
}

test.describe.configure({ mode: 'serial' })

test.describe('head to head: no protection vs community guard vs shield', () => {
  test('no protection', async ({ page }) => {
    const result = await measure(page, 'none')
    results.push(result)
    expect(result.domErrors.length).toBeGreaterThan(0)
    expect(result.appAliveAfterHide).toBe(false)
  })

  test('community guard from the dev.to article', async ({ page }) => {
    const result = await measure(page, 'community-guard')
    results.push(result)
    expect(result.domErrors).toEqual([])
    expect(result.appAliveAfterHide).toBe(true)
  })

  test('translate shield', async ({ page }) => {
    const result = await measure(page, 'shield')
    results.push(result)
    expect(result.domErrors).toEqual([])
    expect(result.appAliveAfterHide).toBe(true)
    expect(result.counterAfterIncrement).toContain('5')
  })

  test.afterAll(() => {
    mkdirSync(REPORT_DIR, { recursive: true })
    writeFileSync(`${REPORT_DIR}/comparison.json`, JSON.stringify(results, null, 2))
  })
})
