const DICTIONARY: Record<string, string> = {
  There: 'Er',
  there: 'er',
  are: 'zijn',
  is: 'is',
  lights: 'lampen',
  light: 'lamp',
  Total: 'Totaal',
  items: 'artikelen',
  Alternative: 'Alternatief',
  Text: 'Tekst',
  end: 'einde',
  and: 'en',
  Price: 'Prijs',
  per: 'per',
  unit: 'stuk',
}

const WORD_PATTERN = /[A-Za-z]+/g

const translateSentence = (value: string): string =>
  value.replace(WORD_PATTERN, (word) => DICTIONARY[word] ?? word)

const isOptedOut = (element: Element): boolean =>
  Boolean(element.closest('[translate="no"], .notranslate'))

const collectTextNodes = (root: ParentNode): Text[] => {
  const walker = document.createTreeWalker(root as Node, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  while (walker.nextNode()) {
    const current = walker.currentNode
    if (current instanceof Text && current.nodeValue?.trim()) nodes.push(current)
  }

  const hosts = (root as Element).querySelectorAll?.('*') ?? []
  hosts.forEach((host) => {
    if (!host.shadowRoot) return
    nodes.push(...collectTextNodes(host.shadowRoot))
  })

  return nodes
}

/**
 * Reproduces what Chrome's translator measurably does to the DOM: every TextNode
 * is replaced by a `<font dir style="vertical-align: inherit">` holding the
 * translation while the original is detached but kept alive, open shadow roots
 * are entered, and `translate="no"` and `.notranslate` are left alone.
 *
 * It deliberately does not re-translate content that changes afterwards. Chrome
 * only re-scans what enters the viewport, so a simulator that repaired every
 * mutation would flatter any shim measured against it.
 */
export const simulateTranslate = (root: Element): number => {
  const nodes = collectTextNodes(root)
  let replaced = 0

  nodes.forEach((node) => {
    const parent = node.parentElement
    if (!parent || parent.tagName === 'FONT') return
    if (isOptedOut(parent)) return

    const wrapper = document.createElement('font')
    wrapper.setAttribute('style', 'vertical-align: inherit;')
    wrapper.setAttribute('dir', 'ltr')
    wrapper.textContent = translateSentence(node.nodeValue ?? '')
    parent.insertBefore(wrapper, node)
    parent.removeChild(node)
    replaced += 1
  })

  document.documentElement.lang = 'nl'
  return replaced
}
