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

let links = new WeakMap<Text, NodeLink>()
let wrappers = new WeakSet<Element>()

let forwarders: Record<InterceptedProperty, PropertyDescriptor> | null = null
let natives: Record<InterceptedProperty, PropertyDescriptor | undefined> | null = null

const nativeDescriptorOf = (property: InterceptedProperty): PropertyDescriptor | undefined => {
  if (property === 'data') return Object.getOwnPropertyDescriptor(CharacterData.prototype, 'data')
  return Object.getOwnPropertyDescriptor(Node.prototype, property)
}

/**
 * Resolves the native accessors once, on first use rather than at module scope.
 * Reading `Node.prototype` when the module loads throws `ReferenceError: Node is
 * not defined` on the server, which would break any app importing this from
 * shared code, so nothing here may run before a DOM exists.
 */
const nativeAccessors = (): Record<InterceptedProperty, PropertyDescriptor | undefined> | null => {
  if (natives) return natives
  if (typeof Node === 'undefined') return null

  natives = {
    nodeValue: nativeDescriptorOf('nodeValue'),
    data: nativeDescriptorOf('data'),
    textContent: nativeDescriptorOf('textContent'),
  }
  return natives
}

const readProperty = (node: Node, property: InterceptedProperty): string => {
  const getter = nativeAccessors()?.[property]?.get
  if (!getter) return ''
  return String(getter.call(node) ?? '')
}

const forwardWrite = (node: Text, next: string): void => {
  const link = links.get(node)
  if (!link?.wrapper.isConnected) return

  const translated = readProperty(link.wrapper, 'textContent')
  const merged = mergeIntoTranslated(
    link.sourceText,
    next,
    translated,
    document.documentElement.lang,
  )
  link.sourceText = next
  if (merged === translated) return
  nativeAccessors()?.textContent?.set?.call(link.wrapper, merged)
}

/**
 * Builds the forwarding accessors once per property. They close over nothing
 * per node, so a full-page translation linking thousands of text nodes reuses
 * three descriptors instead of allocating nine objects for each one.
 */
const forwardingDescriptors = (): Record<InterceptedProperty, PropertyDescriptor> | null => {
  if (forwarders) return forwarders

  const accessors = nativeAccessors()
  if (!accessors) return null

  const build = (property: InterceptedProperty): PropertyDescriptor | null => {
    const native = accessors[property]
    if (!native?.get || !native.set) return null

    const nativeGet = native.get
    const nativeSet = native.set

    return {
      configurable: true,
      enumerable: false,
      get(this: Text): string {
        return nativeGet.call(this)
      },
      set(this: Text, value: string): void {
        nativeSet.call(this, value)
        forwardWrite(this, String(value ?? ''))
      },
    }
  }

  const nodeValue = build('nodeValue')
  const data = build('data')
  const textContent = build('textContent')
  if (!nodeValue || !data || !textContent) return null

  forwarders = { nodeValue, data, textContent }
  return forwarders
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

  links.set(detached, { wrapper, sourceText: readProperty(detached, 'nodeValue') })

  const descriptors = forwardingDescriptors()
  if (!descriptors) return
  INTERCEPTED_PROPERTIES.forEach((property) => {
    Object.defineProperty(detached, property, descriptors[property])
  })
}

export const wrapperFor = (node: Node): Element | null => {
  if (!isText(node)) return null
  const link = links.get(node)
  if (!link?.wrapper.isConnected) return null
  return link.wrapper
}

export const isWrapper = (node: Node): boolean => isElement(node) && wrappers.has(node)

/**
 * Drops every link, which turns each intercepted accessor into a pass-through:
 * the getter still delegates to the native one and the setter forwards nowhere.
 * The own properties stay defined, because deleting them would need a list of
 * every node ever linked, and that list grows for the lifetime of a page that
 * keeps translating.
 */
export const releaseInterceptors = (): void => {
  links = new WeakMap()
  wrappers = new WeakSet()
  forwarders = null
}
