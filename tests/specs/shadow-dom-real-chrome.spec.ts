import { writeFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { launchWithAutoTranslate, disposeProfile } from '../fixtures/branded-browser'
import { bundleShield } from '../fixtures/bundle-shield'

const TESTBED = 'http://localhost:5199/'
const TARGET = 'nl'
const REPORT = 'research/shadow-dom-real-chrome.json'

interface Arm {
  shield: boolean
  before: string
  after: string
}

const outcomes: Arm[] = []

const readShadow = (page: Page): Promise<string> =>
  page.evaluate(
    () => document.getElementById('shadow-host')?.shadowRoot?.textContent?.trim() ?? '',
  )

test.describe('shadow DOM under the real Chrome translator', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(300_000)

  const run = async (withShield: boolean) => {
    const { context, profileDir } = await launchWithAutoTranslate({
      channel: 'chrome',
      from: 'en',
      to: TARGET,
    })

    try {
      if (withShield) {
        await context.addInitScript({
          content: `${bundleShield()}
;document.addEventListener('DOMContentLoaded',function(){window.TranslateShield.initTranslateShield()});`,
        })
      }

      const page = context.pages()[0] || (await context.newPage())
      await page.goto(TESTBED)
      await page.waitForSelector('#shadow-host')

      await page.evaluate(() => document.getElementById('shadow-host')?.scrollIntoView())
      await page.waitForFunction(
        () => {
          const text = document.getElementById('shadow-host')?.shadowRoot?.textContent ?? ''
          return text.includes('lampen') || text.includes('lampjes')
        },
        undefined,
        { timeout: 90_000 },
      )

      const before = await readShadow(page)
      await page.click('#btn-increment')
      await page.waitForTimeout(2_500)
      const outcome = { shield: withShield, before, after: await readShadow(page) }
      outcomes.push(outcome)
      return outcome
    } finally {
      await context.close()
      disposeProfile(profileDir)
    }
  }

  test('without the shield the shadow value freezes', async () => {
    const { before, after } = await run(false)
    expect(before).toContain('4')
    expect(after).toContain('4')
    expect(after).not.toContain('5')
  })

  test('with the shield it updates and stays Dutch', async () => {
    const { before, after } = await run(true)
    expect(before).toContain('4')
    expect(after).toContain('5')
    expect(after).toMatch(/lampen|lampjes/)
  })

  test.afterAll(() => {
    writeFileSync(REPORT, `${JSON.stringify(outcomes, null, 2)}
`)
  })
})
