import type { TranslatorEngine } from './types'

const GOOGLE_WRAPPER_TAG = 'FONT'
const GOOGLE_WRAPPER_STYLE = 'inherit'
const YANDEX_WRAPPER_TAG = 'YA-TR-SPAN'
const EDGE_MARKER_ATTRIBUTES = ['_msttexthash', '_msthash'] as const
const FIREFOX_MARKER_ATTRIBUTE = 'data-moz-translations-id'

export const isText = (node: Node): node is Text => node.nodeType === Node.TEXT_NODE

export const isElement = (node: Node): node is Element => node.nodeType === Node.ELEMENT_NODE

/**
 * Recognises the element a translator injected in place of a TextNode.
 *
 * A bare `<font>` is not enough: apps emit those through rendered markdown, CMS
 * content and `dangerouslySetInnerHTML`. Google's wrapper is identifiable by the
 * inline `vertical-align: inherit` it always carries, which has to be read off
 * `style` rather than `getComputedStyle` because the computed value resolves to
 * `baseline`.
 */
export const isTranslatorWrapper = (node: Node, extraTags: ReadonlyArray<string>): boolean => {
  if (!isElement(node)) return false
  if (node.tagName === YANDEX_WRAPPER_TAG) return true
  if (extraTags.includes(node.tagName)) return true
  if (node.tagName !== GOOGLE_WRAPPER_TAG) return false

  const inlineStyle = node.getAttribute('style') ?? ''
  return inlineStyle.includes(`vertical-align: ${GOOGLE_WRAPPER_STYLE}`)
}

/**
 * Names the translator currently working on the document, or null when none is.
 * Edge and Firefox rewrite text nodes in place and inject no wrapper, so they are
 * reported for observability but leave the shield nothing to mirror into.
 */
export const detectEngine = (root: ParentNode): TranslatorEngine | null => {
  if (root.querySelector(YANDEX_WRAPPER_TAG.toLowerCase())) return 'yandex'
  if (root.querySelector(`${GOOGLE_WRAPPER_TAG.toLowerCase()}[style*="vertical-align: inherit"]`)) {
    return 'google'
  }
  const edgeSelector = EDGE_MARKER_ATTRIBUTES.map((name) => `[${name}]`).join(',')
  if (root.querySelector(edgeSelector)) return 'edge'
  if (root.querySelector(`[${FIREFOX_MARKER_ATTRIBUTE}]`)) return 'firefox'
  return null
}

export const engineUsesWrappers = (engine: TranslatorEngine | null): boolean =>
  engine === 'google' || engine === 'yandex'
