/**
 * A live Google-Translate lookalike, injected into the recorder page so the
 * instrument can be verified against an engine whose behaviour we know exactly.
 * It wraps TextNodes in <font style="vertical-align: inherit">, detaches the
 * originals, honours translate="no" and .notranslate, and re-translates late
 * content after a known delay — which is what lets us check that the recorder's
 * timing measurements are accurate.
 */
export const LIVE_TRANSLATOR_SOURCE = `
window.__installLiveTranslator = function (delayMs) {
  var DICTIONARY = {
    There: 'Er', there: 'er', are: 'zijn', is: 'is', lights: 'lampen', light: 'lamp',
    Total: 'Totaal', room: 'kamer', the: 'de', The: 'De', in: 'in', per: 'per',
    order: 'bestelling', First: 'Eerste', Second: 'Tweede', Third: 'Derde',
    quick: 'snelle', brown: 'bruine', fox: 'vos', jumps: 'springt', over: 'over',
    lazy: 'luie', dog: 'hond', added: 'toegevoegd', late: 'laat', hover: 'zweef',
    me: 'mij', waiting: 'wachten', for: 'op', experiment: 'experiment',
    inside: 'binnen', shadow: 'schaduw', root: 'wortel', and: 'en', on: 'op',
    of: 'van', May: 'mei', Prices: 'Prijzen', status: 'status'
  }
  var WORDS = /[A-Za-z]+/g
  var busy = false
  var timer = null

  function translate(value) {
    return value.replace(WORDS, function (word) {
      return Object.prototype.hasOwnProperty.call(DICTIONARY, word) ? DICTIONARY[word] : word
    })
  }

  function blocked(element) {
    return !!element.closest('[translate="no"], .notranslate')
  }

  function sweep() {
    busy = true
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false)
    var pending = []
    while (walker.nextNode()) {
      var node = walker.currentNode
      var parent = node.parentElement
      if (!node.nodeValue || !node.nodeValue.trim()) continue
      if (!parent || parent.tagName === 'FONT' || parent.tagName === 'SCRIPT') continue
      if (parent.tagName === 'TEXTAREA' || parent.tagName === 'STYLE') continue
      if (blocked(parent)) continue
      pending.push(node)
    }
    pending.forEach(function (node) {
      var parent = node.parentElement
      if (!parent) return
      var wrapper = document.createElement('font')
      wrapper.style.verticalAlign = 'inherit'
      wrapper.textContent = translate(node.nodeValue)
      parent.insertBefore(wrapper, node)
      parent.removeChild(node)
    })
    document.documentElement.lang = 'nl'
    busy = false
    return pending.length
  }

  sweep()

  var observer = new MutationObserver(function () {
    if (busy) return
    if (timer) window.clearTimeout(timer)
    timer = window.setTimeout(sweep, delayMs)
  })
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  window.__liveTranslatorDelay = delayMs
}
`
