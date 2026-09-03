import { writeFileSync, mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { launchWithAutoTranslate, disposeProfile } from '../fixtures/branded-browser'

const RECORDER_URL = 'http://localhost:5200/'
const TARGET = 'nl'
const SOURCE_TEXT = 'There are 4 lights!'
const IDLE_PROOF_MS = 5_000
const IDLE_DEADLINE_MS = 60_000
const REACTION_WAIT_MS = 15_000
const REPORT_PATH = 'research/visibility-confound.json'

type Placement = 'in view' | 'off screen'
type Operation = 'restore the original node' | 'write into the wrapper'

interface Outcome {
  operation: Operation
  placement: Placement
  reachedIdle: boolean
  wasVisible: boolean
  textAfterOperation: string
  reactedAfterMs: number | null
  textAfterWaiting: string
  engineRepairedIt: boolean
}

const ensureIdle = async (page: Page): Promise<boolean> => {
  const deadline = Date.now() + IDLE_DEADLINE_MS
  let attempt = 0
  while (Date.now() < deadline) {
    attempt += 1
    const id = `idle-canary-${attempt}`
    await page.evaluate(
      ({ nodeId, text }) => {
        const line = document.createElement('p')
        line.id = nodeId
        line.textContent = text
        document.getElementById('probes')?.appendChild(line)
        line.scrollIntoView()
      },
      { nodeId: id, text: 'canary text that should get translated' },
    )
    const provenAt = Date.now() + IDLE_PROOF_MS
    let untouched = true
    while (Date.now() < provenAt) {
      await page.waitForTimeout(300)
      const text = await page.evaluate((nodeId) => document.getElementById(nodeId)?.textContent ?? '', id)
      if (!text.includes('canary text')) {
        untouched = false
        break
      }
    }
    await page.evaluate((nodeId) => document.getElementById(nodeId)?.remove(), id)
    if (untouched) return true
  }
  return false
}

const isVisible = (page: Page, probeId: string): Promise<boolean> =>
  page.evaluate((id) => {
    const element = document.querySelector(`[data-probe="${id}"]`)
    if (!element) return false
    const box = element.getBoundingClientRect()
    return box.top < window.innerHeight && box.bottom > 0
  }, probeId)

const readProbe = (page: Page, probeId: string): Promise<string> =>
  page.evaluate((id) => document.querySelector(`[data-probe="${id}"]`)?.textContent ?? '', probeId)

const restoreOriginal = (page: Page, probeId: string): Promise<boolean> =>
  page.evaluate(
    ({ id, source }) => {
      const host = document.querySelector(`[data-probe="${id}"]`)
      const wrapper = host?.querySelector('font')
      if (!host || !wrapper || !wrapper.parentNode) return false
      const original = document.createTextNode(source)
      wrapper.parentNode.insertBefore(original, wrapper)
      wrapper.parentNode.removeChild(wrapper)
      return true
    },
    { id: probeId, source: SOURCE_TEXT },
  )

const writeIntoWrapper = (page: Page, probeId: string): Promise<boolean> =>
  page.evaluate((id) => {
    const wrapper = document.querySelector(`[data-probe="${id}"] font`)
    if (!wrapper) return false
    wrapper.textContent = 'Er zijn 7 lampen!'
    return true
  }, probeId)

test.describe('is the phase A conclusion a visibility artefact', () => {
  test.setTimeout(1_800_000)

  test('restore and mirror, in view and off screen', async () => {
    const { context, profileDir } = await launchWithAutoTranslate({
      channel: 'chrome',
      from: 'en',
      to: TARGET,
    })
    const outcomes: Outcome[] = []

    const cases: Array<{ operation: Operation; placement: Placement }> = [
      { operation: 'restore the original node', placement: 'in view' },
      { operation: 'restore the original node', placement: 'off screen' },
      { operation: 'write into the wrapper', placement: 'in view' },
      { operation: 'write into the wrapper', placement: 'off screen' },
    ]

    try {
      const page = context.pages()[0] || (await context.newPage())

      for (const testCase of cases) {
        await page.goto(`${RECORDER_URL}?autoarm=1&engine=visibility&target=${TARGET}`)
        await page.waitForFunction(
          () => document.querySelectorAll('#probes font').length > 0,
          undefined,
          { timeout: 90_000 },
        )
        const reachedIdle = await ensureIdle(page)

        const probeId = 'simple'
        if (testCase.placement === 'in view') {
          await page.evaluate((id) => {
            document.querySelector(`[data-probe="${id}"]`)?.scrollIntoView({ block: 'center' })
          }, probeId)
        } else {
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
        }
        await page.waitForTimeout(1_500)
        const wasVisible = await isVisible(page, probeId)

        const applied =
          testCase.operation === 'restore the original node'
            ? await restoreOriginal(page, probeId)
            : await writeIntoWrapper(page, probeId)
        expect(applied).toBe(true)

        const textAfterOperation = await readProbe(page, probeId)
        const startedAt = Date.now()
        let reactedAfterMs: number | null = null
        const deadline = Date.now() + REACTION_WAIT_MS
        while (Date.now() < deadline) {
          const current = await readProbe(page, probeId)
          if (current !== textAfterOperation) {
            reactedAfterMs = Date.now() - startedAt
            break
          }
          await page.waitForTimeout(200)
        }

        const textAfterWaiting = await readProbe(page, probeId)
        outcomes.push({
          operation: testCase.operation,
          placement: testCase.placement,
          reachedIdle,
          wasVisible,
          textAfterOperation,
          reactedAfterMs,
          textAfterWaiting,
          engineRepairedIt: textAfterWaiting !== textAfterOperation,
        })
      }
    } finally {
      await context.close()
      disposeProfile(profileDir)
    }

    mkdirSync('research', { recursive: true })
    writeFileSync(REPORT_PATH, JSON.stringify(outcomes, null, 2))
    expect(outcomes.length).toBe(cases.length)
  })
})
