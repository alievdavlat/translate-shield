import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import {
  launchWithAutoTranslate,
  disposeProfile,
  skipWithoutRealChrome,
} from '../fixtures/branded-browser'
import { bundleShield } from '../fixtures/bundle-shield'

const RECORDER_URL = 'http://localhost:5200/'
const TARGETS = ['nl', 'ru']
const PATIENCE_MS = 8_000
const NEW_VALUE = 'There are 7 lights!'
const REPORT_PATH = 'research/head-to-head-real-chrome.json'

type Arm = 'no-protection' | 'translation-resilience' | 'translate-shield'

interface ArmOutcome {
  arm: Arm
  target: string
  protectionInstalled: boolean
  patchedMethods: string[]
  competitorError: string | null
  visibleBeforeWrite: string
  visibleAfterWrite: string
  visibleAfterSettling: string
  valueReachedScreen: boolean
  fellBackToSourceLanguage: boolean
  nodeWasConnected: boolean
}

const commonJsWrapper = (source: string, globalName: string): string =>
  `(function(){var module={exports:{}};var exports=module.exports;
${source}
;window.${globalName}=module.exports;})()`

const injectionFor = (arm: Arm): string | null => {
  if (arm === 'translation-resilience') {
    const source = readFileSync('node_modules/translation-resilience/dist/index.cjs', 'utf8')
    return `${commonJsWrapper(source, '__competitor')};document.addEventListener('DOMContentLoaded',function(){try{window.__competitor.installTranslationResilience()}catch(e){window.__competitorError=String((e&&e.stack)||e)}});`
  }
  if (arm === 'translate-shield') {
    return `${bundleShield()}
;document.addEventListener('DOMContentLoaded',function(){window.TranslateShield.initTranslateShield()});`
  }
  return null
}

const readProbe = (page: Page): Promise<string> =>
  page.evaluate(() => document.querySelector('[data-probe="simple"]')?.textContent || '')

const runArm = async (arm: Arm, target: string): Promise<ArmOutcome> => {
  const { context, profileDir } = await launchWithAutoTranslate({
    channel: 'chrome',
    from: 'en',
    to: target,
  })

  try {
    const injection = injectionFor(arm)
    if (injection) await context.addInitScript({ content: injection })

    const page = context.pages()[0] || (await context.newPage())
    await page.goto(`${RECORDER_URL}?autoarm=1&engine=${arm}&target=${target}&patience=${PATIENCE_MS}`)
    await page.waitForFunction(() => document.querySelectorAll('#probes font').length > 0, undefined, {
      timeout: 90_000,
    })
    await page.waitForTimeout(1500)

    const installation = await page.evaluate(() => {
      const isPatched = (fn: unknown) => !/\[native code\]/.test(String(fn))
      const descriptor = Object.getOwnPropertyDescriptor(Node.prototype, 'nodeValue')
      return {
        removeChild: isPatched(Node.prototype.removeChild),
        insertBefore: isPatched(Node.prototype.insertBefore),
        appendChild: isPatched(Node.prototype.appendChild),
        nodeValueSetter: isPatched(descriptor?.set),
        competitorPresent: Boolean(window.__competitor),
        shieldPresent: Boolean(window.TranslateShield),
        competitorError: window.__competitorError || null,
      }
    })

    const visibleBeforeWrite = await readProbe(page)

    const written = await page.evaluate(async (value) => {
      const probe = window.__probes.find((candidate) => candidate.id === 'simple')
      return window.Experiments.frameworkWrite(probe, value)
    }, NEW_VALUE)

    const visibleAfterWrite = await readProbe(page)
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(4000)
    const visibleAfterSettling = await readProbe(page)

    const patchedMethods = Object.entries(installation)
      .filter(([, value]) => value === true)
      .map(([key]) => key)
    if (installation.competitorError) {
      test.info().annotations.push({ type: 'competitor-error', description: String(installation.competitorError) })
    }

    return {
      arm,
      target,
      protectionInstalled: arm === 'no-protection' ? false : patchedMethods.length > 0,
      patchedMethods,
      competitorError: installation.competitorError ? String(installation.competitorError) : null,
      visibleBeforeWrite,
      visibleAfterWrite,
      visibleAfterSettling,
      valueReachedScreen: visibleAfterSettling.includes('7'),
      fellBackToSourceLanguage: visibleAfterSettling.includes('There are'),
      nodeWasConnected: Boolean(written.nodeWasConnected),
    }
  } finally {
    await context.close()
    disposeProfile(profileDir)
  }
}

test.describe('head to head in real Chrome with built-in translation', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(400_000)

  test.beforeAll(() => skipWithoutRealChrome())

  const outcomes: ArmOutcome[] = []
  const arms: Arm[] = ['no-protection', 'translation-resilience', 'translate-shield']

  TARGETS.forEach((target) => {
    arms.forEach((arm) => {
      test(`${target} / arm: ${arm}`, async () => {
        const outcome = await runArm(arm, target)
        outcomes.push(outcome)
        expect(outcome.visibleBeforeWrite.length).toBeGreaterThan(0)
        if (arm !== 'no-protection') expect(outcome.protectionInstalled).toBe(true)
      })
    })
  })

  test.afterAll(() => {
    mkdirSync('research', { recursive: true })
    writeFileSync(REPORT_PATH, JSON.stringify(outcomes, null, 2))
  })
})
