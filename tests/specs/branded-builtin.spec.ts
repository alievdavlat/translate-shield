import { writeFileSync, mkdirSync } from 'node:fs'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { launchWithAutoTranslate, disposeProfile } from '../fixtures/branded-browser'

const RECORDER_URL = 'http://localhost:5200/'
const REPORT_DIR = 'research/fingerprints'
const TARGET = 'nl'
const PATIENCE_MS = 20_000

interface RunOutcome {
  translated: boolean
  raw: string | null
}

const runStudy = async (context: BrowserContext, engine: string): Promise<RunOutcome> => {
  const page: Page = context.pages()[0] || (await context.newPage())
  await page.goto(`${RECORDER_URL}?autoarm=1&engine=${engine}&target=${TARGET}&patience=${PATIENCE_MS}`)
  await expect(page.locator('#status')).toContainText('Armed', { timeout: 20_000 })

  const translated = await page
    .waitForFunction(
      () =>
        document.querySelectorAll('#probes font').length > 0 ||
        document.querySelectorAll('#probes [_msttexthash]').length > 0 ||
        document.querySelectorAll('#probes [data-moz-translations-id]').length > 0,
      undefined,
      { timeout: 90_000 },
    )
    .then(() => true)
    .catch(() => false)

  if (!translated) return { translated: false, raw: null }

  await page.waitForTimeout(1500)
  await page.click('#btn-capture')
  await page.click('#btn-experiments')
  await expect(page.locator('#status')).toContainText('Experiments done', { timeout: 400_000 })
  await page.click('#btn-copy')

  await page.screenshot({ path: `research/screenshots/${engine}-${TARGET}.png`, fullPage: true })
  return { translated: true, raw: await page.locator('#json-output').inputValue() }
}

test.describe('browser built-in translators', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(600_000)

  const engines: Array<{ channel: 'chrome' | 'msedge'; label: string }> = [
    { channel: 'chrome', label: 'chrome-builtin' },
    { channel: 'msedge', label: 'edge-builtin' },
  ]

  engines.forEach(({ channel, label }) => {
    test(`fingerprint ${label}`, async () => {
      const { context, profileDir } = await launchWithAutoTranslate({
        channel,
        from: 'en',
        to: TARGET,
      })

      const outcome = await runStudy(context, label).finally(async () => {
        await context.close()
      })
      disposeProfile(profileDir)

      if (!outcome.raw) {
        test.info().annotations.push({
          type: 'not-measured',
          description: `${label} did not auto-translate within 60s; the built-in translator needs a manual click in this environment.`,
        })
        test.skip(true, `${label} did not auto-translate — needs a human to accept the bubble`)
        return
      }

      mkdirSync(REPORT_DIR, { recursive: true })
      writeFileSync(`${REPORT_DIR}/${label}-${TARGET}.json`, outcome.raw)

      const report = JSON.parse(outcome.raw)
      expect(report.fingerprint.probes.length).toBeGreaterThan(10)
    })
  })
})
