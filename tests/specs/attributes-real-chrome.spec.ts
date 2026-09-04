import { createServer, type Server } from 'node:http'
import { writeFileSync, mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import {
  launchWithAutoTranslate,
  disposeProfile,
  skipWithoutRealChrome,
} from '../fixtures/branded-browser'

const PORT = 5312
const REPORT_PATH = 'research/attributes.json'
const SENTENCE = 'There are four lights on the panel'
const PADDING =
  'The harbour master keeps a separate ledger for every ship that arrives after midnight, and ' +
  'the inspector counted the lights twice before signing the report on the following morning.'

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Attribute probes</title>
<meta name="description" content="${SENTENCE} in the description meta tag">
</head>
<body>
<h1>Attribute probes</h1>
<p>${PADDING}</p>

<img id="p-alt" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
     alt="${SENTENCE} in an alt attribute" width="20" height="20">
<span id="p-title" title="${SENTENCE} in a title attribute">hover target</span>
<input id="p-placeholder" placeholder="${SENTENCE} in a placeholder">
<button id="p-aria" aria-label="${SENTENCE} in an aria-label">press</button>
<input id="p-value" type="submit" value="${SENTENCE} in a submit value">
<span id="p-content" data-content="${SENTENCE} in a data attribute">data target</span>

<img id="p-alt-optout" translate="no" class="notranslate"
     src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
     alt="${SENTENCE} in a protected alt" width="20" height="20">
<span id="p-title-optout" translate="no" class="notranslate"
      title="${SENTENCE} in a protected title">hover target</span>
<input id="p-placeholder-optout" translate="no" class="notranslate"
       placeholder="${SENTENCE} in a protected placeholder">
</body></html>`

const serve = (): Promise<Server> =>
  new Promise((resolve) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(PAGE)
    })
    server.listen(PORT, () => resolve(server))
  })

const PROBES: ReadonlyArray<{ id: string; attribute: string; optOut: boolean }> = [
  { id: 'p-alt', attribute: 'alt', optOut: false },
  { id: 'p-title', attribute: 'title', optOut: false },
  { id: 'p-placeholder', attribute: 'placeholder', optOut: false },
  { id: 'p-aria', attribute: 'aria-label', optOut: false },
  { id: 'p-value', attribute: 'value', optOut: false },
  { id: 'p-content', attribute: 'data-content', optOut: false },
  { id: 'p-alt-optout', attribute: 'alt', optOut: true },
  { id: 'p-title-optout', attribute: 'title', optOut: true },
  { id: 'p-placeholder-optout', attribute: 'placeholder', optOut: true },
]

const readProbes = (probes: ReadonlyArray<{ id: string; attribute: string; optOut: boolean }>) =>
  probes.map((probe) => ({
    ...probe,
    value: document.getElementById(probe.id)?.getAttribute(probe.attribute) ?? null,
  }))

/**
 * Records which attributes a translator rewrites, and whether an opt-out on the
 * element protects them. Text nodes are the bug this library repairs; attributes
 * are a separate surface that reaches a framework as a hydration mismatch, and
 * neither was measured here before a reader reported it on `alt`.
 */
test.describe('which attributes does a translator rewrite', () => {
  test.beforeAll(() => skipWithoutRealChrome())
  test.setTimeout(180_000)

  test('records every attribute probe before and after translation', async () => {
    const server = await serve()
    const { context, profileDir } = await launchWithAutoTranslate({
      channel: 'chrome',
      from: 'en',
      to: 'ru',
    })

    try {
      const page = context.pages()[0] || (await context.newPage())
      await page.goto(`http://localhost:${PORT}/`)
      const before = await page.evaluate(readProbes, PROBES)

      await page.waitForFunction(() => document.querySelectorAll('font').length > 0, undefined, {
        timeout: 120_000,
      })
      await page.waitForTimeout(4000)
      const after = await page.evaluate(readProbes, PROBES)
      const metaAfter = await page.evaluate(
        () => document.querySelector('meta[name="description"]')?.getAttribute('content') ?? null,
      )

      const rows = PROBES.map((probe, index) => {
        const was = before[index]?.value ?? null
        const now = after[index]?.value ?? null
        return {
          id: probe.id,
          attribute: probe.attribute,
          optOut: probe.optOut,
          before: was,
          after: now,
          translated: was !== now,
        }
      })

      const report = {
        schema: 'translate-shield/attributes/1',
        engine: 'chrome built-in',
        target: 'ru',
        probes: rows,
        metaDescription: { after: metaAfter },
        translatedAttributes: rows.filter((row) => row.translated).map((row) => row.attribute),
        optOutHeld: rows.filter((row) => row.optOut).every((row) => !row.translated),
      }
      mkdirSync('research', { recursive: true })
      writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2))
      console.log(
        'ATTRS translated=' +
          JSON.stringify(report.translatedAttributes) +
          ' optOutHeld=' +
          report.optOutHeld,
      )
      expect(rows.length).toBe(PROBES.length)
    } finally {
      await context.close()
      disposeProfile(profileDir)
      server.close()
    }
  })
})
