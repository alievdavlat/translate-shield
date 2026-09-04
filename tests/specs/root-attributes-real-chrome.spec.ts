import { createServer, type Server } from 'node:http'
import { writeFileSync, mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import {
  launchWithAutoTranslate,
  disposeProfile,
  skipWithoutRealChrome,
} from '../fixtures/branded-browser'

const PORT = 5311
const REPORT_PATH = 'research/root-attributes.json'
const PARAGRAPH =
  'There are four lights on the panel and the inspector counted them twice before signing the ' +
  'report. The harbour master keeps a separate ledger for every ship that arrives after midnight.'

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Root attributes</title></head>
<body><h1>Root attributes</h1><p data-probe="simple">${PARAGRAPH}</p></body></html>`

const serve = (): Promise<Server> =>
  new Promise((resolve) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(PAGE)
    })
    server.listen(PORT, () => resolve(server))
  })

const readRoot = () => ({
  lang: document.documentElement.getAttribute('lang'),
  className: document.documentElement.getAttribute('class'),
  attributes: Object.fromEntries(
    Array.from(document.documentElement.attributes).map((attribute) => [
      attribute.name,
      attribute.value,
    ]),
  ),
  bodyClassName: document.body.getAttribute('class'),
})

/**
 * Records what a translator writes onto <html> itself, as opposed to the text
 * nodes below it. A Next.js reader hit a hydration mismatch on exactly this:
 * the server sent lang="de" with no class, and by the time React hydrated,
 * Chrome had rewritten lang and added its own class. That is a different defect
 * from the detached-node bug this library repairs, and it was unmeasured here.
 */
test.describe('what a translator writes onto the document element', () => {
  test.beforeAll(() => skipWithoutRealChrome())
  test.setTimeout(180_000)

  test('records root attributes before and after translation', async () => {
    const server = await serve()
    const { context, profileDir } = await launchWithAutoTranslate({
      channel: 'chrome',
      from: 'en',
      to: 'ru',
    })

    try {
      const page = context.pages()[0] || (await context.newPage())
      await page.goto(`http://localhost:${PORT}/`)
      const before = await page.evaluate(readRoot)

      await page.waitForFunction(() => document.querySelectorAll('font').length > 0, undefined, {
        timeout: 120_000,
      })
      await page.waitForTimeout(3000)
      const after = await page.evaluate(readRoot)

      const report = {
        schema: 'translate-shield/root-attributes/1',
        engine: 'chrome built-in',
        target: 'ru',
        before,
        after,
        changed: {
          lang: before.lang !== after.lang,
          className: before.className !== after.className,
          addedAttributes: Object.keys(after.attributes).filter(
            (name) => !(name in before.attributes),
          ),
        },
      }
      mkdirSync('research', { recursive: true })
      writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2))
      console.log('ROOT ATTRS ' + JSON.stringify(report.after) + ' changed=' + JSON.stringify(report.changed))
      expect(after.lang).not.toBe(before.lang)
    } finally {
      await context.close()
      disposeProfile(profileDir)
      server.close()
    }
  })
})
