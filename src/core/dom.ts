import type { TranslatorEngine } from './types'

interface EngineFingerprint {
  name: TranslatorEngine
  wrapperTag?: string
  wrapperStyle?: string
  markerAttributes?: ReadonlyArray<string>
}

/**
 * One row per translator, and everything else in this file is derived from it.
 * Adding an engine means adding a row, not editing four predicates that have to
 * agree with each other.
 *
 * A bare tag is never enough. Apps emit `<font>` through rendered markdown, CMS
 * content and `dangerouslySetInnerHTML`, so Google's wrapper is only recognised
 * with the inline `vertical-align: inherit` it always carries, read off the
 * `style` attribute because `getComputedStyle` resolves `inherit` to `baseline`.
 *
 * Edge and Firefox rewrite the live text node and inject no wrapper, so they
 * have markers but no tag. They are named for observability; there is nothing
 * for the shield to mirror into.
 */
const ENGINES: ReadonlyArray<EngineFingerprint> = [
  { name: 'google', wrapperTag: 'FONT', wrapperStyle: 'vertical-align: inherit' },
  { name: 'yandex', wrapperTag: 'YA-TR-SPAN' },
  { name: 'edge', markerAttributes: ['_msttexthash', '_msthash'] },
  { name: 'firefox', markerAttributes: ['data-moz-translations-id'] },
]

export const MARKER_ATTRIBUTES: ReadonlyArray<string> = ENGINES.flatMap(
  (engine) => engine.markerAttributes ?? [],
)

export const isText = (node: Node): node is Text => node.nodeType === Node.TEXT_NODE

export const isElement = (node: Node): node is Element => node.nodeType === Node.ELEMENT_NODE

const matchesFingerprint = (element: Element, engine: EngineFingerprint): boolean => {
  if (engine.wrapperTag !== element.tagName) return false
  if (!engine.wrapperStyle) return true
  return (element.getAttribute('style') ?? '').includes(engine.wrapperStyle)
}

const engineOwningTag = (tagName: string): EngineFingerprint | undefined =>
  ENGINES.find((engine) => engine.wrapperTag === tagName)

/**
 * Recognises the element a translator injected in place of a TextNode.
 *
 * `extraTags` widens the set for an engine we do not ship a row for. It cannot
 * narrow or replace a built-in fingerprint: passing `FONT`, the tag every bug
 * report names, must not turn every `<font>` on the page into a wrapper.
 */
export const isTranslatorWrapper = (node: Node, extraTags: ReadonlyArray<string>): boolean => {
  if (!isElement(node)) return false

  const owner = engineOwningTag(node.tagName)
  if (owner) return matchesFingerprint(node, owner)

  return extraTags.some((tag) => tag.toUpperCase() === node.tagName)
}

/** Names the engine that produced a wrapper the observer already matched. */
export const engineOfWrapper = (wrapper: Element): TranslatorEngine | null =>
  engineOwningTag(wrapper.tagName)?.name ?? null

/** Names the translator working on a document, wrapper or marker attributes alike. */
export const detectEngine = (root: ParentNode): TranslatorEngine | null => {
  for (const engine of ENGINES) {
    const selectors = [
      engine.wrapperTag &&
        `${engine.wrapperTag.toLowerCase()}${engine.wrapperStyle ? `[style*="${engine.wrapperStyle}"]` : ''}`,
      ...(engine.markerAttributes ?? []).map((attribute) => `[${attribute}]`),
    ].filter(Boolean)

    if (selectors.length > 0 && root.querySelector(selectors.join(','))) return engine.name
  }
  return null
}
