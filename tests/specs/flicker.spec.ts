import { writeFileSync, mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import {
  launchWithAutoTranslate,
  disposeProfile,
  skipWithoutRealChrome,
} from '../fixtures/branded-browser'

const RECORDER_URL = 'http://localhost:5200/'
const TARGET = 'nl'
const UPDATES = 4
const SAMPLE_EVERY_MS = 50
const SAMPLE_WINDOW_MS = 1_500
const REPLICATES = 5
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

interface Spread {
  min: number
  median: number
  max: number
}

interface StrategySummary {
  strategy: Strategy
  perUpdateMs: Spread
  totalMs: Spread
  worstSingleUpdateMs: number
  everyUpdateMs: number[]
}

/**
 * A single run of this measurement is not a fact about the strategy. Four runs
 * land between 500 and 600 ms and a fifth spikes to 2,200 ms, because the cost
 * is however long Chrome takes to notice a restored node and translate it
 * again. Quoting one run is how the published figure drifted to a number no run
 * produced, so the report keeps every replicate and the spread across them.
 */
const spreadOf = (values: number[]): Spread => {
  if (values.length === 0) return { min: 0, median: 0, max: 0 }

  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const below = sorted[middle - 1] ?? 0
  const above = sorted[middle] ?? 0

  return {
    min: sorted[0] ?? 0,
    median: sorted.length % 2 === 0 ? (below + above) / 2 : above,
    max: sorted[sorted.length - 1] ?? 0,
  }
}

const summarise = (strategy: Strategy, replicates: StrategyResult[][]): StrategySummary => {
  const runs = replicates.flat().filter((run) => run.strategy === strategy)
  const everyUpdateMs = runs.flatMap((run) => run.updates.map((update) => update.sourceLanguageMs))
  return {
    strategy,
    perUpdateMs: spreadOf(everyUpdateMs),
    totalMs: spreadOf(runs.map((run) => run.totalSourceLanguageMs)),
    worstSingleUpdateMs: Math.max(0, ...everyUpdateMs),
    everyUpdateMs,
  }
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
  test.beforeAll(() => skipWithoutRealChrome())

  test('repeated updates to a value the user is looking at', async () => {
    const replicates: StrategyResult[][] = []

    for (let replicate = 0; replicate < REPLICATES; replicate += 1) {
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

      replicates.push(results)
    }

    const report = {
      schema: 'translate-shield/flicker/2',
      meta: {
        replicates: REPLICATES,
        updatesPerReplicate: UPDATES,
        sampleEveryMs: SAMPLE_EVERY_MS,
        sampleWindowMs: SAMPLE_WINDOW_MS,
        target: TARGET,
        resolutionNote: `sampling every ${SAMPLE_EVERY_MS} ms, so every figure is quantised to ${SAMPLE_EVERY_MS} ms`,
      },
      summary: [
        summarise('restore and retranslate', replicates),
        summarise('mirror into the wrapper', replicates),
      ],
      replicates,
    }

    mkdirSync('research', { recursive: true })
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2))
    expect(replicates.length).toBe(REPLICATES)
  })
})
