import { existsSync, rmSync, readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { LIVE_TRANSLATOR_SOURCE } from '../fixtures/live-translator'

const RECORDER_URL = 'http://localhost:5200/'
const EXPECTED_FILE = 'research/fingerprints/fingerprint-save-check-nl.json'

test('Save into repo writes the export straight into research/fingerprints', async ({ page }) => {
  test.setTimeout(120_000)
  if (existsSync(EXPECTED_FILE)) rmSync(EXPECTED_FILE)

  await page.goto(`${RECORDER_URL}?autoarm=1&engine=save-check&target=nl`)
  await expect(page.locator('#status')).toContainText('Armed')

  await page.evaluate(LIVE_TRANSLATOR_SOURCE)
  await page.evaluate(() => window.__installLiveTranslator(150))
  await page.waitForFunction(() => document.querySelectorAll('#probes font').length > 0)

  await page.click('#btn-capture')
  await expect(page.locator('#btn-save')).toBeEnabled()

  await page.click('#btn-save')
  await expect(page.locator('#status')).toContainText('Saved to', { timeout: 30_000 })

  expect(existsSync(EXPECTED_FILE)).toBe(true)
  const saved = JSON.parse(readFileSync(EXPECTED_FILE, 'utf8'))
  expect(saved.meta.engineLabel).toBe('save-check')
  expect(saved.fingerprint.probes.length).toBeGreaterThan(10)

  rmSync(EXPECTED_FILE)
})
