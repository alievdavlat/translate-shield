import { writeFileSync, mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { launchWithAutoTranslate, disposeProfile } from '../fixtures/branded-browser'

const RECORDER_URL = 'http://localhost:5200/'
const TARGET = 'nl'
const UPDATES = 4
const SAMPLE_EVERY_MS = 50
const SAMPLE_WINDOW_MS = 1_500
const REPORT_PATH = 'research/flicker.json'

type Strategy = 'restore and retranslate' | 'mirror into the wrapper'

interface UpdateResult {
  value: number
  sourceLanguageSamples: number
  totalSamples: number
  sourceLanguageMs: number
  finalText: string
}

interface StrategyResult {
  strategy: Strategy
  updates: UpdateResult[]
  totalSourceLanguageMs: number
  worstUpdateMs: number
}

const applyRestore = (page: Page, value: number): Promise<boolean> =>
  page.evaluate((next) => {
    const host = document.querySelector('[data-probe="simple"]')
    const wrapper = host?.querySelector('font')
    if (!host || !wrapper || !wrapper.parentNode) return false
    const original = document.createTextNode(`There are ${next} lights!`)
    wrapper.parentNode.insertBefore(original, wrapper)
    wrapper.parentNode.removeChild(wrapper)
    return true
  }, value)

const applyMirror = (page: Page, value: number): Promise<boolean> =>
  page.evaluate((next) => {
    const wrapper = document.querySelector('[data-probe="simple"] font')
    if (!wrapper) return false
    wrapper.textContent = `Er zijn ${next} lampen!`
    return true
  }, value)

const sampleWindow = async (page: Page): Promise<{ english: number; total: number; final: string }> => {
  let english = 0
  let total = 0
  const deadline = Date.now() + SAMPLE_WINDOW_MS
  let final = ''

  while (Date.now() < deadline) {
    final = await page.evaluate(
      () => document.querySelector('[data-probe="simple"]')?.textContent ?? '',
    )
    total += 1
    if (/There are/.test(final)) english += 1
    await page.waitForTimeout(SAMPLE_EVERY_MS)
  }
  return { english, total, final }
}

const runStrategy = async (page: Page, strategy: Strategy): Promise<StrategyResult> => {
  const updates: UpdateResult[] = []

  for (let index = 0; index < UPDATES; index += 1) {
    const value = 5 + index
    const applied =
      strategy === 'restore and retranslate' ? await applyRestore(page, value) : await applyMirror(page, value)
    if (!applied) break

    const { english, total, final } = await sampleWindow(page)
    updates.push({
      value,
      sourceLanguageSamples: english,
      totalSamples: total,
      sourceLanguageMs: english * SAMPLE_EVERY_MS,
      finalText: final,
    })
  }

  const perUpdate = updates.map((update) => update.sourceLanguageMs)
  return {
    strategy,
    updates,
    totalSourceLanguageMs: perUpdate.reduce((sum, value) => sum + value, 0),
    worstUpdateMs: perUpdate.length > 0 ? Math.max(...perUpdate) : 0,
  }
}

test.describe('how much source-language text does each strategy put on screen', () => {
  test.setTimeout(1_800_000)

  test('repeated updates to a value the user is looking at', async () => {
    const { context, profileDir } = await launchWithAutoTranslate({
      channel: 'chrome',
      from: 'en',
      to: TARGET,
    })
    const results: StrategyResult[] = []

    try {
      const page = context.pages()[0] || (await context.newPage())

      for (const strategy of ['restore and retranslate', 'mirror into the wrapper'] as Strategy[]) {
        await page.goto(`${RECORDER_URL}?autoarm=1&engine=flicker&target=${TARGET}`)
        await page.waitForFunction(
          () => document.querySelectorAll('#probes font').length > 0,
          undefined,
          { timeout: 90_000 },
        )
        await page.evaluate(() => {
          document.querySelector('[data-probe="simple"]')?.scrollIntoView({ block: 'center' })
        })
        await page.waitForTimeout(3_000)
        results.push(await runStrategy(page, strategy))
      }
    } finally {
      await context.close()
      disposeProfile(profileDir)
    }

    mkdirSync('research', { recursive: true })
    writeFileSync(REPORT_PATH, JSON.stringify(results, null, 2))
    expect(results.length).toBe(2)
  })
})
