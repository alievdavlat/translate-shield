import { createServer, type Server } from 'node:http'
import { writeFileSync, mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { launchWithAutoTranslate, disposeProfile, skipWithoutRealChrome } from '../fixtures/branded-browser'

const PORT = 5310
const PARAGRAPH =
  'There are four lights on the panel and the inspector counted them twice before signing the report. ' +
  'The harbour master keeps a separate ledger for every ship that arrives after midnight.'

const framePage = (label: string): string => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${label}</title></head>
<body><h1>${label}</h1><p data-probe="${label}">${PARAGRAPH}</p></body></html>`

const hostPage = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Host</title></head>
<body><h1>Host document</h1><p data-probe="host">${PARAGRAPH}</p>
<iframe id="child" src="/child.html" width="700" height="300" style="border:1px solid"></iframe>
</body></html>`

const serve = (): Promise<Server> =>
  new Promise((resolve) => {
    const server = createServer((req, res) => {
      const body = req.url?.startsWith('/child.html') ? framePage('child') : hostPage
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(body)
    })
    server.listen(PORT, () => resolve(server))
  })

test.describe('does Chrome translate a same-origin iframe', () => {
  test.beforeAll(() => skipWithoutRealChrome())
  test.setTimeout(180_000)

  test('records where font wrappers appear', async () => {
    const server = await serve()
    const { context, profileDir } = await launchWithAutoTranslate({ channel: 'chrome', from: 'en', to: 'nl' })

    try {
      const page = context.pages()[0] || (await context.newPage())
      await page.goto(`http://localhost:${PORT}/`)
      await page.waitForFunction(() => document.querySelectorAll('font').length > 0, undefined, {
        timeout: 120_000,
      })
      await page.waitForTimeout(4000)

      const host = await page.evaluate(() => ({
        fonts: document.querySelectorAll('font').length,
        text: document.querySelector('[data-probe="host"]')?.textContent?.slice(0, 60) || '',
      }))
      const frame = page.frames().find((f) => f.url().includes('child.html'))
      const child = frame
        ? await frame.evaluate(() => ({
            fonts: document.querySelectorAll('font').length,
            text: document.querySelector('[data-probe="child"]')?.textContent?.slice(0, 60) || '',
          }))
        : null

      mkdirSync('research', { recursive: true })
      const report = { host, child, childFrameFound: Boolean(frame) }
      writeFileSync('research/iframe-scope.json', JSON.stringify(report, null, 2))
      await page.screenshot({ path: 'research/screenshots/iframe-scope.png', fullPage: true })
      console.log('IFRAME PROBE ' + JSON.stringify(report))
      expect(host.fonts).toBeGreaterThan(0)
    } finally {
      await context.close()
      disposeProfile(profileDir)
      server.close()
    }
  })
})
