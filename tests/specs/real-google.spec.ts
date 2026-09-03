import { writeFileSync, mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { translateWithGoogle } from '../fixtures/google-element'

const RECORDER_URL = 'http://localhost:5200/'
const REPORT_DIR = 'research/fingerprints'
const PATIENCE_MS = 20_000

interface TargetLanguage {
  code: string
  why: string
}

const TARGETS: TargetLanguage[] = [
  { code: 'nl', why: 'number-invariant sentences, the easy case' },
  { code: 'ru', why: 'CLDR plural categories change the noun and the verb' },
  { code: 'ar', why: 'six plural categories plus Arabic-Indic digits' },
]

test.describe('real Google Translate engine', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(600_000)

  TARGETS.forEach((target) => {
    test(`fingerprint against google-element -> ${target.code} (${target.why})`, async ({ page }) => {
      await page.goto(`${RECORDER_URL}?patience=${PATIENCE_MS}`)
      await page.fill('#engine-label', 'google-element')
      await page.fill('#target-language', target.code)

      await page.click('#btn-arm')
      await expect(page.locator('#status')).toContainText('Armed')

      await translateWithGoogle(page, target.code)

      await page.click('#btn-capture')
      await expect(page.locator('#status')).toContainText('ENGINE', { timeout: 20_000 })

      await page.click('#btn-experiments')
      await expect(page.locator('#status')).toContainText('Experiments done', { timeout: 400_000 })

      await page.click('#btn-copy')
      const raw = await page.locator('#json-output').inputValue()

      mkdirSync(REPORT_DIR, { recursive: true })
      writeFileSync(`${REPORT_DIR}/google-element-${target.code}.json`, raw)
      await page.screenshot({
        path: `research/screenshots/google-element-${target.code}.png`,
        fullPage: true,
      })

      const report = JSON.parse(raw)
      expect(report.fingerprint.probes.length).toBeGreaterThan(10)
      expect(report.mutations.length).toBeGreaterThan(5)
    })
  })
})
