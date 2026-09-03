import { MARKER_ATTRIBUTES, detectEngine } from './dom'
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

  const detectAndReport = (): boolean => {
    const engine = detectEngine(document)
    if (!engine) return false
    onDetected({ lang: document.documentElement.lang, engine, wrapperTag: '' })
    return true
  }

  if (detectAndReport()) return () => undefined

  const observer = new MutationObserver(() => {
    if (detectAndReport()) observer.disconnect()
  })
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['lang', ...MARKER_ATTRIBUTES],
  })

  return () => observer.disconnect()
}
