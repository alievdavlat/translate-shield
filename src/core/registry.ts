import { mergeIntoTranslated } from './merge-text'
import { isElement, isText } from './dom'

interface NodeLink {
  wrapper: Element
  sourceText: string
}

type InterceptedProperty = 'nodeValue' | 'data' | 'textContent'

const INTERCEPTED_PROPERTIES: ReadonlyArray<InterceptedProperty> = [
  'nodeValue',
  'data',
  'textContent',
]

const links = new WeakMap<Text, NodeLink>()
const wrappers = new WeakSet<Element>()
const intercepted = new WeakSet<Text>()
const interceptedRefs = new Set<WeakRef<Text>>()

/**
 * Every descriptor lookup is deferred until a DOM actually exists. Reading
 * `Node.prototype` at module scope throws `ReferenceError: Node is not defined`
 * on the server, which would break any app that imports this from shared code.
 */
const descriptorOf = (property: InterceptedProperty): PropertyDescriptor | undefined => {
  if (typeof Node === 'undefined') return undefined
  if (property === 'data') {
    return Object.getOwnPropertyDescriptor(CharacterData.prototype, 'data')
  }
  return Object.getOwnPropertyDescriptor(Node.prototype, property)
}

const readNodeValue = (node: Text): string => {
  const getter = descriptorOf('nodeValue')?.get
  if (!getter) return ''
  return String(getter.call(node) ?? '')
}

const readWrapper = (wrapper: Element): string => {
  const getter = descriptorOf('textContent')?.get
  if (!getter) return ''
  return String(getter.call(wrapper) ?? '')
}

const writeWrapper = (wrapper: Element, value: string): void => {
  descriptorOf('textContent')?.set?.call(wrapper, value)
}

const forwardWrite = (node: Text, next: string): void => {
  const link = links.get(node)
  if (!link) return
  if (!link.wrapper.isConnected) return

  const translated = readWrapper(link.wrapper)
  const locale = document.documentElement.lang
  const merged = mergeIntoTranslated(link.sourceText, next, translated, locale)
  link.sourceText = next
  if (merged === translated) return
  writeWrapper(link.wrapper, merged)
}

const defineForwardingProperty = (node: Text, property: InterceptedProperty): void => {
  const descriptor = descriptorOf(property)
  if (!descriptor?.get || !descriptor.set) return

  const nativeGet = descriptor.get
  const nativeSet = descriptor.set

  Object.defineProperty(node, property, {
    configurable: true,
    enumerable: false,
    get(this: Text): string {
      return nativeGet.call(this)
    },
    set(this: Text, value: string): void {
      nativeSet.call(this, value)
      forwardWrite(this, String(value ?? ''))
    },
  })
}

const interceptWrites = (node: Text): void => {
  if (intercepted.has(node)) return
  intercepted.add(node)
  interceptedRefs.add(new WeakRef(node))
  INTERCEPTED_PROPERTIES.forEach((property) => defineForwardingProperty(node, property))
}

/**
 * Links a TextNode the translator detached to the element that replaced it, so
 * later framework writes reach the node the user actually sees.
 */
export const linkNodes = (detached: Text, wrapper: Element): void => {
  wrappers.add(wrapper)

  const existing = links.get(detached)
  if (existing) {
    existing.wrapper = wrapper
    return
  }

  links.set(detached, { wrapper, sourceText: readNodeValue(detached) })
  interceptWrites(detached)
}

export const wrapperFor = (node: Node): Element | null => {
  if (!isText(node)) return null
  const link = links.get(node)
  if (!link?.wrapper.isConnected) return null
  return link.wrapper
}

export const isWrapper = (node: Node): boolean => isElement(node) && wrappers.has(node)

export const releaseInterceptors = (): void => {
  interceptedRefs.forEach((ref) => {
    const node = ref.deref()
    if (!node) return
    INTERCEPTED_PROPERTIES.forEach((property) => Reflect.deleteProperty(node, property))
    intercepted.delete(node)
    links.delete(node)
  })
  interceptedRefs.clear()
}
