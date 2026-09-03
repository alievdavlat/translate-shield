import { engineOfWrapper, isElement, isText, isTranslatorWrapper } from './dom'
import { isWrapper, linkNodes } from './registry'
import type { TranslationInfo } from './types'

interface ObserverConfig {
  root: Element
  wrapperTags: ReadonlyArray<string>
  onTranslationDetected: (info: TranslationInfo) => void
}

const OBSERVE_OPTIONS: MutationObserverInit = { childList: true, subtree: true }

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
 *
 * Open shadow roots are observed too. Chrome and Yandex translate through the
 * boundary and detach the nodes inside it, and a `MutationObserver` on a host
 * element never reports what happens in its shadow root. `attachShadow` is
 * wrapped so roots opened after install are picked up as well: attaching a
 * shadow root produces no mutation record, so there is nothing else to watch.
 */
export const startObserver = ({
  root,
  wrapperTags,
  onTranslationDetected,
}: ObserverConfig): (() => void) => {
  let detected = false
  const observedRoots = new WeakSet<Node>()

  const observer = new MutationObserver((records) => {
    const detachedTexts = new Map<Node, Text[]>()
    const injectedWrappers = new Map<Node, Element[]>()

    records.forEach((record) => {
      if (isWrapper(record.target)) return

      record.removedNodes.forEach((node) => {
        if (isText(node)) pushInto(detachedTexts, record.target, node)
      })

      record.addedNodes.forEach((node) => {
        if (isTranslatorWrapper(node, wrapperTags)) {
          pushInto(injectedWrappers, record.target, node as Element)
          return
        }
        if (isElement(node)) observeShadowRootsUnder(node)
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
    const [firstBatch] = injectedWrappers.values()
    const wrapper = firstBatch?.[0]
    onTranslationDetected({
      lang: document.documentElement.lang,
      engine: wrapper ? engineOfWrapper(wrapper) : null,
      wrapperTag: wrapper?.tagName ?? '',
    })
  })

  function observeRoot(node: Node): void {
    if (observedRoots.has(node)) return
    observedRoots.add(node)
    observer.observe(node, OBSERVE_OPTIONS)
  }

  function observeShadowRootsUnder(scope: Element | ShadowRoot): void {
    const hosts = isElement(scope) ? [scope, ...scope.querySelectorAll('*')] : scope.querySelectorAll('*')

    hosts.forEach((host) => {
      if (!host.shadowRoot) return
      observeRoot(host.shadowRoot)
      observeShadowRootsUnder(host.shadowRoot)
    })
  }

  const nativeAttachShadow = Element.prototype.attachShadow
  Element.prototype.attachShadow = function attachShadow(
    this: Element,
    init: ShadowRootInit,
  ): ShadowRoot {
    const shadow = nativeAttachShadow.call(this, init)
    if (init.mode === 'open' && root.contains(this)) observeRoot(shadow)
    return shadow
  }

  observeRoot(root)
  observeShadowRootsUnder(root)

  return () => {
    Element.prototype.attachShadow = nativeAttachShadow
    observer.disconnect()
  }
}
