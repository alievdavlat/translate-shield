import { detectEngine, isText, isTranslatorWrapper } from './dom'
import { isWrapper, linkNodes } from './registry'
import type { TranslationInfo } from './types'

interface ObserverConfig {
  root: Element
  wrapperTags: ReadonlyArray<string>
  onTranslationDetected: (info: TranslationInfo) => void
}

const pushInto = <T>(bucket: Map<Node, T[]>, key: Node, value: T): void => {
  const existing = bucket.get(key)
  if (!existing) {
    bucket.set(key, [value])
    return
  }
  existing.push(value)
}

/**
 * Watches for the translator's TextNode-to-wrapper swap and links each pair.
 * Pairing is positional per parent: within one observer batch the n-th injected
 * wrapper belongs to the n-th detached TextNode of that parent.
 */
export const startObserver = ({
  root,
  wrapperTags,
  onTranslationDetected,
}: ObserverConfig): (() => void) => {
  let detected = false

  const observer = new MutationObserver((records) => {
    const detachedTexts = new Map<Node, Text[]>()
    const injectedWrappers = new Map<Node, Element[]>()

    records.forEach((record) => {
      if (isWrapper(record.target)) return

      record.removedNodes.forEach((node) => {
        if (isText(node)) pushInto(detachedTexts, record.target, node)
      })

      record.addedNodes.forEach((node) => {
        if (!isTranslatorWrapper(node, wrapperTags)) return
        pushInto(injectedWrappers, record.target, node as Element)
      })
    })

    if (injectedWrappers.size === 0) return

    injectedWrappers.forEach((elements, parent) => {
      const texts = detachedTexts.get(parent) ?? []
      elements.forEach((wrapper, index) => {
        const detachedText = texts[index]
        if (!detachedText) return
        linkNodes(detachedText, wrapper)
      })
    })

    if (detected) return
    detected = true
    const [firstParent] = Array.from(injectedWrappers.values())
    onTranslationDetected({
      lang: document.documentElement.lang,
      engine: detectEngine(document),
      wrapperTag: firstParent?.[0]?.tagName ?? '',
    })
  })

  observer.observe(root, { childList: true, subtree: true })

  return () => observer.disconnect()
}
