import { detectEngine } from './dom'
import type { TranslationInfo } from './types'

/**
 * Reports when a translator starts working on the document, without patching
 * anything. Apps that only want to warn the user, or to switch a formatter, can
 * use this on its own; the shield uses the heavier observer instead.
 */
export const observeTranslation = (
  onDetected: (info: TranslationInfo) => void,
): (() => void) => {
  if (typeof document === 'undefined') return () => undefined

  let reported = false

  const report = (): boolean => {
    if (reported) return true
    const engine = detectEngine(document)
    if (!engine) return false
    reported = true
    onDetected({ lang: document.documentElement.lang, engine, wrapperTag: '' })
    return true
  }

  if (report()) return () => undefined

  const observer = new MutationObserver(() => {
    if (report()) observer.disconnect()
  })
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['lang', '_msttexthash', 'data-moz-translations-id'],
  })

  return () => observer.disconnect()
}
