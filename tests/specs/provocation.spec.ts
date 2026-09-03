import { writeFileSync, mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { launchWithAutoTranslate, disposeProfile } from '../fixtures/branded-browser'

const RECORDER_URL = 'http://localhost:5200/'
const TARGET = 'nl'
const ENGLISH_MARKER = 'There are 9 lights waiting to be translated'
const IDLE_PROOF_MS = 6_000
const IDLE_DEADLINE_MS = 60_000
const REACTION_WAIT_MS = 10_000
const REPORT_PATH = 'research/provocation.json'

type SignalKind = 'in-page' | 'trusted-input' | 'none'

interface Provocation {
  name: string
  kind: SignalKind
  apply: (page: Page) => Promise<void>
}

const inPage = (name: string, script: string): Provocation => ({
  name,
  kind: 'in-page',
  apply: async (page) => {
    await page.evaluate((source) => {
      const run = new Function(source)
      run()
    }, script)
  },
})

const PROVOCATIONS: Provocation[] = [
  { name: 'none (control)', kind: 'none', apply: async () => {} },
  inPage('forced layout read', 'void document.body.offsetHeight'),
  inPage('synthetic visibilitychange', "document.dispatchEvent(new Event('visibilitychange'))"),
  inPage('synthetic window focus', "window.dispatchEvent(new Event('focus'))"),
  inPage('synthetic resize', "window.dispatchEvent(new Event('resize'))"),
  inPage('synthetic mousemove', "document.dispatchEvent(new MouseEvent('mousemove',{bubbles:true}))"),
  inPage('scrollIntoView on the node', "document.getElementById('provocation-target').scrollIntoView()"),
  inPage('scrollBy 1px and back', 'window.scrollBy(0,1); window.scrollBy(0,-1)'),
  inPage('scrollTo bottom and back', 'window.scrollTo(0, document.body.scrollHeight); window.scrollTo(0,0)'),
  {
    name: 'trusted mouse wheel',
    kind: 'trusted-input',
    apply: async (page) => {
      await page.mouse.wheel(0, 200)
      await page.mouse.wheel(0, -200)
    },
  },
  {
    name: 'trusted mouse move',
    kind: 'trusted-input',
    apply: async (page) => {
      await page.mouse.move(200, 200)
      await page.mouse.move(260, 300)
    },
  },
]

interface Outcome {
  provocation: string
  kind: SignalKind
  reachedIdle: boolean
  baselineHeld: boolean
  reactedAfterMs: number | null
  textAfter: string
  valid: boolean
}

const placeNode = (page: Page, id: string): Promise<void> =>
  page.evaluate(
    ({ nodeId, text }) => {
      document.getElementById(nodeId)?.remove()
      const line = document.createElement('p')
      line.id = nodeId
      line.textContent = text
      document.getElementById('probes')?.appendChild(line)
    },
    { nodeId: id, text: ENGLISH_MARKER },
  )

const readNode = (page: Page, id: string): Promise<string | null> =>
  page.evaluate((nodeId) => document.getElementById(nodeId)?.textContent ?? null, id)

const isStillEnglish = (text: string | null): boolean => text !== null && text.includes(ENGLISH_MARKER)

/**
 * Chrome keeps translating newly added content on its own for a while after the
 * page is translated, then goes quiet. Every measurement here has to start from
 * that quiet state, otherwise the engine's own activity is credited to our signal.
 */
const waitForIdleTranslator = async (page: Page): Promise<boolean> => {
  const deadline = Date.now() + IDLE_DEADLINE_MS
  let attempt = 0

  while (Date.now() < deadline) {
    attempt += 1
    const canaryId = `idle-canary-${attempt}`
    await placeNode(page, canaryId)

    const provenAt = Date.now() + IDLE_PROOF_MS
    let stayedEnglish = true
    while (Date.now() < provenAt) {
      await page.waitForTimeout(300)
      if (!isStillEnglish(await readNode(page, canaryId))) {
        stayedEnglish = false
        break
      }
    }

    await page.evaluate((nodeId) => document.getElementById(nodeId)?.remove(), canaryId)
    if (stayedEnglish) return true
  }
  return false
}

test.describe('which signal makes Chrome re-scan the page', () => {
  test.setTimeout(1_800_000)

  test('measure every provocation candidate from an idle translator', async () => {
    const { context, profileDir } = await launchWithAutoTranslate({
      channel: 'chrome',
      from: 'en',
      to: TARGET,
    })
    const outcomes: Outcome[] = []

    try {
      const page = context.pages()[0] || (await context.newPage())

      for (const provocation of PROVOCATIONS) {
        await page.goto(`${RECORDER_URL}?autoarm=1&engine=provocation&target=${TARGET}`)
        await page.waitForFunction(
          () => document.querySelectorAll('#probes font').length > 0,
          undefined,
          { timeout: 90_000 },
        )

        const reachedIdle = await waitForIdleTranslator(page)
        await placeNode(page, 'provocation-target')
        await page.waitForTimeout(2_500)
        const baselineHeld = isStillEnglish(await readNode(page, 'provocation-target'))

        const startedAt = Date.now()
        await provocation.apply(page)

        let reactedAfterMs: number | null = null
        const deadline = Date.now() + REACTION_WAIT_MS
        while (Date.now() < deadline) {
          const current = await readNode(page, 'provocation-target')
          if (current !== null && !isStillEnglish(current)) {
            reactedAfterMs = Date.now() - startedAt
            break
          }
          await page.waitForTimeout(150)
        }

        const textAfter = (await readNode(page, 'provocation-target')) ?? '<node missing>'
        outcomes.push({
          provocation: provocation.name,
          kind: provocation.kind,
          reachedIdle,
          baselineHeld,
          reactedAfterMs,
          textAfter,
          valid: reachedIdle && baselineHeld,
        })
      }
    } finally {
      await context.close()
      disposeProfile(profileDir)
    }

    mkdirSync('research', { recursive: true })
    writeFileSync(REPORT_PATH, JSON.stringify(outcomes, null, 2))
    expect(outcomes.length).toBe(PROVOCATIONS.length)
  })
})
