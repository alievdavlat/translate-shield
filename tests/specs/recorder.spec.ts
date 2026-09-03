import { writeFileSync, mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { LIVE_TRANSLATOR_SOURCE } from '../fixtures/live-translator'

const RECORDER_URL = 'http://localhost:5200/'
const SIMULATED_DELAY_MS = 150
const REPORT_DIR = 'research/fingerprints'

interface ProbeFingerprint {
  id: string
  detachedTextNodes: number
  textNodesMutatedInPlace: number
  wrapper: { tag: string; inlineVerticalAlign: string; computedVerticalAlign: string } | null
}

type ExperimentResult = Record<string, unknown>

interface ExperimentResults {
  frameworkWrite: ExperimentResult
  wrapperWrite: ExperimentResult
  untranslatedWindow: ExperimentResult
  lateContent: ExperimentResult
  burstOneHz: ExperimentResult
}

interface RecorderReport {
  meta: { engineLabel: string; targetLanguage: string }
  fingerprint: { langChanged: boolean; markersFound: string[]; probes: ProbeFingerprint[] }
  experiments: ExperimentResults
  mutations: unknown[]
}

test.describe('the recorder instrument itself', () => {
  test.setTimeout(120_000)

  test('records a full study against a translator we control', async ({ page }) => {
    await page.goto(RECORDER_URL)
    await page.fill('#engine-label', 'simulated-gt')
    await page.fill('#target-language', 'nl')

    await page.click('#btn-arm')
    await expect(page.locator('#status')).toContainText('Armed')

    await page.evaluate(LIVE_TRANSLATOR_SOURCE)
    await page.evaluate((delay) => window.__installLiveTranslator(delay), SIMULATED_DELAY_MS)
    await page.waitForFunction(() => document.querySelectorAll('#probes font').length > 0)

    await page.click('#btn-capture')
    await expect(page.locator('#status')).toContainText('DETACHING ENGINE')

    await page.click('#btn-experiments')
    await expect(page.locator('#status')).toContainText('Experiments done', { timeout: 90_000 })

    await page.screenshot({ path: 'research/screenshots/recorder.png', fullPage: true })

    await page.click('#btn-copy')
    const raw = await page.locator('#json-output').inputValue()
    const report: RecorderReport = JSON.parse(raw)

    mkdirSync(REPORT_DIR, { recursive: true })
    writeFileSync(`${REPORT_DIR}/simulated-gt-nl.json`, JSON.stringify(report, null, 2))

    expect(report.meta.engineLabel).toBe('simulated-gt')
    expect(report.fingerprint.langChanged).toBe(true)
    expect(report.fingerprint.markersFound).toContain('<font>')
    expect(report.mutations.length).toBeGreaterThan(10)

    const byId = (id: string) => report.fingerprint.probes.find((probe) => probe.id === id)

    const simple = byId('simple')
    expect(simple?.detachedTextNodes).toBeGreaterThan(0)
    expect(simple?.wrapper?.tag).toBe('FONT')
    expect(simple?.wrapper?.inlineVerticalAlign).toBe('inherit')
    expect(simple?.wrapper?.computedVerticalAlign).not.toBe('inherit')

    expect(byId('translate-no')?.detachedTextNodes).toBe(0)
    expect(byId('notranslate-class')?.detachedTextNodes).toBe(0)

    expect(report.experiments.frameworkWrite.applicable).toBe(true)
    expect(report.experiments.wrapperWrite.applicable).toBe(true)
    expect(report.experiments.untranslatedWindow.applicable).toBe(true)
    expect(report.experiments.lateContent.applicable).toBe(true)
    expect(report.experiments.burstOneHz.applicable).toBe(true)

    const window_ = report.experiments.untranslatedWindow
    expect(window_.retranslated).toBe(true)
    expect(Number(window_.retranslatedAfterMs)).toBeGreaterThan(SIMULATED_DELAY_MS * 0.5)
    expect(Number(window_.retranslatedAfterMs)).toBeLessThan(SIMULATED_DELAY_MS * 8)

    expect(report.experiments.lateContent.translated).toBe(true)
    expect(Number(report.experiments.burstOneHz.writes)).toBeGreaterThan(2)
  })
})
