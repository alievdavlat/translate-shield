import type { Page } from '@playwright/test'

const WIDGET_SRC = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit'

/**
 * Loads Google's own translate element bundle into the page and drives it to the
 * target language. This is the same `translate_a/element.js` payload Chromium
 * fetches for its built-in translation, so the DOM mutations it produces are the
 * real thing rather than a simulation. It does send the page's probe strings to
 * Google for translation, which is the point of the experiment.
 */
export const translateWithGoogle = async (page: Page, target: string): Promise<void> => {
  await page.evaluate((src) => {
    const mount = document.createElement('div')
    mount.id = 'google_translate_element'
    mount.setAttribute('translate', 'no')
    mount.className = 'notranslate'
    document.body.appendChild(mount)

    window.googleTranslateElementInit = () => {
      new window.google.translate.TranslateElement(
        { pageLanguage: 'en', autoDisplay: false },
        'google_translate_element',
      )
    }

    const script = document.createElement('script')
    script.src = src
    document.body.appendChild(script)
  }, WIDGET_SRC)

  await page.waitForSelector('.goog-te-combo', { timeout: 45_000 })
  await page.selectOption('.goog-te-combo', target)
  await page.waitForFunction(() => document.querySelectorAll('#probes font').length > 0, undefined, {
    timeout: 45_000,
  })
}
