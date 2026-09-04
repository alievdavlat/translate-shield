import { writeFileSync, mkdirSync } from 'node:fs'
import { expect, test, type Frame, type Page } from '@playwright/test'
import {
  launchWithAutoTranslate,
  disposeProfile,
  skipWithoutRealChrome,
} from '../fixtures/branded-browser'

const DEMO_URL = 'http://localhost:5202/'
const REPORT_PATH = 'research/demo-page.json'
const SHOT_PATH = 'research/screenshots/demo-translated.png'

interface StageReading {
  onScreen: string
  reactState: string
  verdict: string
}

/**
 * Matches the last path segment exactly. `unshielded.html` contains the string
 * `shielded.html`, so a substring test silently returns the wrong panel and the
 * run reads as a failure of the library rather than of the selector.
 */
const frameFor = (page: Page, name: 'unshielded' | 'shielded'): Frame | undefined =>
  page.frames().find((frame) => {
    const segments = new URL(frame.url()).pathname.split('/')
    return segments[segments.length - 1] === `${name}.html`
  })

const readStage = (page: Page, index: number): Promise<StageReading> =>
  page.evaluate((stageIndex) => {
    const stage = document.querySelectorAll('.stage')[stageIndex]
    const fact = (label: string): string => {
      const rows = Array.from(stage?.querySelectorAll('.stage__facts > div') ?? [])
      const match = rows.find(
        (row) => row.querySelector('dt')?.textContent?.trim().toLowerCase() === label,
      )
      return match?.querySelector('dd')?.textContent?.trim() ?? ''
    }
    return {
      onScreen: fact('screen shows'),
      reactState: fact('react holds'),
      verdict: stage?.querySelector('.stage__verdict')?.textContent?.trim() ?? '',
    }
  }, index)

/**
 * Drives the published demo the way a reader does: real Chrome, real
 * translation, both panels on screen, then the run sequence. It exists because
 * a demo page that quietly stops demonstrating anything is worse than no demo,
 * and nothing else in this suite would notice.
 */
test.describe('the demo page still demonstrates the bug', () => {
  test.beforeAll(() => skipWithoutRealChrome())
  test.setTimeout(300_000)

  test('panel A freezes and crashes while panel B keeps updating in Dutch', async () => {
    const { context, profileDir } = await launchWithAutoTranslate({
      channel: 'chrome',
      from: 'en',
      to: 'nl',
    })

    try {
      const page = context.pages()[0] || (await context.newPage())
      await page.setViewportSize({ width: 1366, height: 768 })
      await page.goto(DEMO_URL)

      await page.waitForFunction(
        () => {
          const panels = Array.from(document.querySelectorAll('iframe.stage__frame'))
          return (
            panels.length === 2 &&
            panels.every(
              (panel) =>
                ((panel as HTMLIFrameElement).contentDocument?.querySelectorAll('font').length ??
                  0) > 0,
            )
          )
        },
        undefined,
        { timeout: 180_000 },
      )
      await page.waitForTimeout(2500)

      const runButton = page.locator('.controls__run')
      await expect(runButton).toBeEnabled({ timeout: 30_000 })

      const beforeRun = {
        unshielded: await readStage(page, 0),
        shielded: await readStage(page, 1),
      }

      await runButton.click()
      await page.waitForTimeout(6000)

      const afterRun = {
        unshielded: await readStage(page, 0),
        shielded: await readStage(page, 1),
      }

      const patchedInFrames = {
        unshielded: await frameFor(page, 'unshielded')?.evaluate(
          () => !/\[native code\]/.test(String(Node.prototype.removeChild)),
        ),
        shielded: await frameFor(page, 'shielded')?.evaluate(
          () => !/\[native code\]/.test(String(Node.prototype.removeChild)),
        ),
      }

      // A crashed panel reports no wrappers, and an earlier gate required wrappers
      // from both panels, so the controls locked the moment the demo worked.
      const stillEnabledAfterCrash = await runButton.isEnabled()

      await page.locator('.controls button', { hasText: 'Reset' }).click()
      await page.waitForTimeout(4000)
      const afterReset = {
        unshielded: await readStage(page, 0),
        shielded: await readStage(page, 1),
      }

      mkdirSync('research/screenshots', { recursive: true })
      await page.screenshot({ path: SHOT_PATH })
      writeFileSync(
        REPORT_PATH,
        JSON.stringify(
          {
            schema: 'translate-shield/demo-page/2',
            target: 'nl',
            patchedInFrames,
            beforeRun,
            afterRun,
            stillEnabledAfterCrash,
            afterReset,
          },
          null,
          2,
        ),
      )
      console.log('DEMO ' + JSON.stringify(afterRun))

      expect(patchedInFrames.unshielded).toBe(false)
      expect(patchedInFrames.shielded).toBe(true)
      expect(afterRun.unshielded.verdict).toContain('crashed')
      expect(afterRun.shielded.verdict).toContain('working')
      expect(afterRun.shielded.onScreen).not.toBe(afterRun.unshielded.onScreen)
      expect(stillEnabledAfterCrash).toBe(true)
      expect(afterReset.unshielded.verdict).not.toContain('crashed')
    } finally {
      await context.close()
      disposeProfile(profileDir)
    }
  })
})
