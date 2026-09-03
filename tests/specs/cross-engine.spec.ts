import { writeFileSync, mkdirSync } from 'node:fs'
import { expect, test, firefox, webkit, type BrowserType } from '@playwright/test'
import { translateWithGoogle } from '../fixtures/google-element'

const RECORDER_URL = 'http://localhost:5200/'
const REPORT_DIR = 'research/fingerprints'
const PATIENCE_MS = 20_000
const TARGET = 'nl'

interface EngineUnderTest {
  browser: BrowserType
  label: string
}

const ENGINES: EngineUnderTest[] = [
  { browser: firefox, label: 'google-element-firefox' },
  { browser: webkit, label: 'google-element-webkit' },
]

test.describe('the same translator on a different browser engine', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(600_000)

  ENGINES.forEach(({ browser, label }) => {
    test(`fingerprint ${label}`, async () => {
      const instance = await browser.launch()
      const page = await instance.newPage()

      try {
        await page.goto(`${RECORDER_URL}?autoarm=1&engine=${label}&target=${TARGET}&patience=${PATIENCE_MS}`)
        await expect(page.locator('#status')).toContainText('Armed', { timeout: 20_000 })

        await translateWithGoogle(page, TARGET)

        await page.click('#btn-capture')
        await page.click('#btn-experiments')
        await expect(page.locator('#status')).toContainText('Experiments done', { timeout: 400_000 })
        await page.click('#btn-copy')

        const raw = await page.locator('#json-output').inputValue()
        mkdirSync(REPORT_DIR, { recursive: true })
        writeFileSync(`${REPORT_DIR}/${label}-${TARGET}.json`, raw)

        const report = JSON.parse(raw)
        expect(report.fingerprint.probes.length).toBeGreaterThan(10)
      } finally {
        await instance.close()
      }
    })
  })
})
