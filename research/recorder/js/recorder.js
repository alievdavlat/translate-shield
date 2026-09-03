/* global window, document, performance, MutationObserver, getComputedStyle */
;(function (global) {
  'use strict'

  var MAX_MUTATIONS = 4000
  var WRAPPER_HINTS = ['FONT', 'YA-TR-SPAN', 'X-BERGAMOT', 'MSTRANSLATE']
  var ENGINE_ATTRIBUTE_HINTS = [
    '_msttexthash',
    '_msthash',
    '_mstmutation',
    'data-moz-translations-id',
    'x-bergamot-translated',
  ]

  var state = {
    startedAt: 0,
    observer: null,
    mutations: [],
    dropped: 0,
    selfOps: [],
    subscribers: [],
    langBefore: '',
    firstForeignMutationAt: null,
  }

  function now() {
    return Math.round(performance.now() * 10) / 10
  }

  function describeNode(node) {
    if (!node) return null
    if (node.nodeType === Node.TEXT_NODE) {
      return { kind: 'text', value: truncate(node.nodeValue) }
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return { kind: 'other', nodeType: node.nodeType }
    }
    return {
      kind: 'element',
      tag: node.tagName,
      attributes: attributesOf(node),
      text: truncate(node.textContent),
    }
  }

  function attributesOf(element) {
    var result = {}
    Array.prototype.forEach.call(element.attributes || [], function (attribute) {
      result[attribute.name] = truncate(attribute.value, 120)
    })
    return result
  }

  function truncate(value, limit) {
    var max = limit || 80
    if (typeof value !== 'string') return value
    return value.length > max ? value.slice(0, max) + '…' : value
  }

  function pathOf(node) {
    var parts = []
    var current = node
    while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 6) {
      var probe = current.getAttribute && current.getAttribute('data-probe')
      if (probe) {
        parts.unshift('[' + probe + ']')
        break
      }
      parts.unshift(current.tagName.toLowerCase() + (current.id ? '#' + current.id : ''))
      current = current.parentElement
    }
    return parts.join(' > ')
  }

  function lastSelfOpDelta() {
    if (state.selfOps.length === 0) return null
    return Math.round((now() - state.selfOps[state.selfOps.length - 1].at) * 10) / 10
  }

  function record(mutation) {
    if (state.mutations.length >= MAX_MUTATIONS) {
      state.dropped += 1
      return null
    }

    var entry = {
      t: now(),
      type: mutation.type,
      target: pathOf(mutation.target),
      targetTag: mutation.target.tagName || mutation.target.nodeName,
      sinceSelfOpMs: lastSelfOpDelta(),
    }

    if (mutation.type === 'characterData') {
      entry.value = truncate(mutation.target.nodeValue)
      entry.previous = truncate(mutation.oldValue)
    }

    if (mutation.type === 'attributes') {
      entry.attribute = mutation.attributeName
      entry.value = truncate(mutation.target.getAttribute(mutation.attributeName), 120)
    }

    if (mutation.type === 'childList') {
      entry.removed = Array.prototype.map.call(mutation.removedNodes, describeNode)
      entry.added = Array.prototype.map.call(mutation.addedNodes, describeNode)
    }

    state.mutations.push(entry)
    return entry
  }

  function looksForeign(mutation) {
    var delta = lastSelfOpDelta()
    if (delta !== null && delta < 60) return false
    if (mutation.type !== 'childList') return true
    return Array.prototype.some.call(mutation.addedNodes, function (node) {
      return node.nodeType === Node.ELEMENT_NODE && WRAPPER_HINTS.indexOf(node.tagName) !== -1
    })
  }

  /**
   * Starts recording. Every mutation the page sees from this point is timestamped,
   * including our own, which are tagged by their distance to the last self operation.
   */
  function start() {
    if (state.observer) return
    state.startedAt = Date.now()
    state.langBefore = document.documentElement.lang || ''
    state.observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        var entry = record(mutation)
        if (!entry) return
        if (state.firstForeignMutationAt === null && looksForeign(mutation)) {
          state.firstForeignMutationAt = entry.t
        }
        state.subscribers.forEach(function (subscriber) {
          subscriber(mutation, entry)
        })
      })
    })
    state.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      characterDataOldValue: true,
      attributes: true,
    })
  }

  function stop() {
    if (!state.observer) return
    state.observer.disconnect()
    state.observer = null
  }

  function noteSelfOp(description) {
    state.selfOps.push({ at: now(), description: description })
  }

  function onMutation(subscriber) {
    state.subscribers.push(subscriber)
    return function unsubscribe() {
      var index = state.subscribers.indexOf(subscriber)
      if (index !== -1) state.subscribers.splice(index, 1)
    }
  }

  /**
   * Resolves with the delay in ms until the next mutation touching the given root,
   * or null when nothing happened before the timeout.
   */
  function waitForMutation(root, timeoutMs, filter) {
    return new Promise(function (resolve) {
      var startedAt = now()
      var timer = null
      var unsubscribe = onMutation(function (mutation, entry) {
        if (!root.contains(mutation.target) && mutation.target !== root) return
        if (filter && !filter(mutation, entry)) return
        cleanup()
        resolve({ delayMs: Math.round((now() - startedAt) * 10) / 10, entry: entry })
      })

      timer = global.setTimeout(function () {
        cleanup()
        resolve(null)
      }, timeoutMs)

      function cleanup() {
        unsubscribe()
        if (timer) global.clearTimeout(timer)
      }
    })
  }

  function wrapperOf(host) {
    var candidates = host.querySelectorAll('*')
    for (var index = 0; index < candidates.length; index += 1) {
      var element = candidates[index]
      if (WRAPPER_HINTS.indexOf(element.tagName) !== -1) return element
      var hasHint = ENGINE_ATTRIBUTE_HINTS.some(function (name) {
        return element.hasAttribute(name)
      })
      if (hasHint) return element
    }
    return null
  }

  function fingerprintProbe(probe) {
    var wrapper = wrapperOf(probe.host)
    var detached = 0
    var reusedInPlace = 0
    var changedInPlace = 0

    probe.textNodes.forEach(function (node) {
      if (!node.isConnected) {
        detached += 1
        return
      }
      reusedInPlace += 1
      if (node.nodeValue !== node.__originalValue) changedInPlace += 1
    })

    return {
      id: probe.id,
      label: probe.label,
      question: probe.question,
      before: probe.before,
      after: probe.read(),
      changed: probe.read() !== probe.before,
      originalTextNodes: probe.textNodes.length,
      detachedTextNodes: detached,
      textNodesStillConnected: reusedInPlace,
      textNodesMutatedInPlace: changedInPlace,
      wrapper: wrapper
        ? {
            tag: wrapper.tagName,
            attributes: attributesOf(wrapper),
            inlineVerticalAlign: wrapper.style.verticalAlign,
            computedVerticalAlign: getComputedStyle(wrapper).verticalAlign,
          }
        : null,
      html: truncate(probe.host.innerHTML, 400),
    }
  }

  function guessEngine() {
    var markers = []
    ENGINE_ATTRIBUTE_HINTS.forEach(function (name) {
      if (document.querySelector('[' + name + ']')) markers.push(name)
    })
    WRAPPER_HINTS.forEach(function (tag) {
      if (document.querySelector(tag.toLowerCase())) markers.push('<' + tag.toLowerCase() + '>')
    })
    return markers
  }

  function snapshot(probes) {
    return {
      langBefore: state.langBefore,
      langAfter: document.documentElement.lang || '',
      langChanged: (document.documentElement.lang || '') !== state.langBefore,
      markersFound: guessEngine(),
      firstForeignMutationAt: state.firstForeignMutationAt,
      probes: probes.map(fingerprintProbe),
    }
  }

  function rememberOriginalValues(probes) {
    probes.forEach(function (probe) {
      probe.textNodes.forEach(function (node) {
        node.__originalValue = node.nodeValue
      })
    })
  }

  global.Recorder = {
    start: start,
    stop: stop,
    noteSelfOp: noteSelfOp,
    onMutation: onMutation,
    waitForMutation: waitForMutation,
    snapshot: snapshot,
    wrapperOf: wrapperOf,
    rememberOriginalValues: rememberOriginalValues,
    state: state,
  }
})(window)
