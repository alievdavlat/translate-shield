import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { bundleShield } from '../fixtures/bundle-shield'

interface InstallReport {
  conflicts: string[]
  warnings: string[]
}

const COMPETITOR = 'node_modules/translation-resilience/dist/index.cjs'

const installShield = (page: Page): Promise<InstallReport> =>
  page.evaluate(() => {
    const warnings: string[] = []
    const nativeWarn = console.warn
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(' '))
    }
    const handle = window.TranslateShield.initTranslateShield()
    console.warn = nativeWarn
    return { conflicts: handle.conflicts(), warnings }
  })

test.describe('another shim on the same page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.addScriptTag({ content: bundleShield() })
    await page.evaluate(() => {
      window.TranslateShield.initTranslateShield().stop()
    })
  })

  test('a clean page reports no conflict', async ({ page }) => {
    const { conflicts, warnings } = await installShield(page)
    expect(conflicts).toEqual([])
    expect(warnings).toEqual([])
  })

  test('a restore-based shim is named, not silently fought', async ({ page }) => {
    const source = readFileSync(COMPETITOR, 'utf8')
    await page.addScriptTag({
      content: `(function(){var module={exports:{}};var exports=module.exports;
${source}
;module.exports.installTranslationResilience();})()`,
    })

    const { conflicts, warnings } = await installShield(page)
    expect(conflicts).toContain('Node.prototype.removeChild')
    expect(conflicts).toContain('Node.prototype.insertBefore')
    expect(conflicts).toContain('Node.prototype.nodeValue')
    expect(warnings.join(' ')).toContain('another shim already replaced')
  })

  test('the pasted crash guard is named too', async ({ page }) => {
    await page.addScriptTag({
      content: `(function(){
        var original = Node.prototype.removeChild;
        Node.prototype.removeChild = function (child) {
          if (child.parentNode !== this) return child;
          return original.call(this, child);
        };
      })()`,
    })

    const { conflicts } = await installShield(page)
    expect(conflicts).toEqual(['Node.prototype.removeChild'])
  })
})
