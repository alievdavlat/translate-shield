/* global window, document, Recorder */
;(function (global) {
  'use strict'

  var WAIT_MS = 6000
  var patience = WAIT_MS

  function flushOwnRecords() {
    return new Promise(function (resolve) {
      global.setTimeout(resolve, 0)
    })
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      global.setTimeout(resolve, ms)
    })
  }

  function firstTextNode(probe) {
    return probe.textNodes[0] || null
  }

  function notApplicable(reason) {
    return { applicable: false, reason: reason }
  }

  /**
   * Picks a probe the engine actually translated. Hard-wiring an experiment to one
   * probe silently produced "no wrapper found" on engines that translate
   * progressively and had not reached that probe yet.
   */
  function probeWithWrapper(probes, preferredIds) {
    var byPreference = preferredIds
      .map(function (id) {
        return probes.filter(function (probe) {
          return probe.id === id
        })[0]
      })
      .filter(Boolean)

    var candidates = byPreference.concat(probes)
    for (var index = 0; index < candidates.length; index += 1) {
      if (Recorder.wrapperOf(candidates[index].host)) return candidates[index]
    }
    return null
  }

  function setPatience(ms) {
    patience = ms || WAIT_MS
  }

  /**
   * Some engines only re-scan on a user-visible signal. Before concluding that an
   * engine ignores a change we scroll, refocus and fire a visibility change, then
   * give it the same patience again.
   */
  async function provoke(root) {
    Recorder.noteSelfOp('provoke')
    global.scrollTo(0, document.body.scrollHeight)
    document.dispatchEvent(new Event('visibilitychange'))
    global.dispatchEvent(new Event('focus'))
    root.scrollIntoView()
    await sleep(120)
    global.scrollTo(0, 0)
    await flushOwnRecords()
    return Recorder.waitForMutation(root, patience)
  }

  /**
   * Writes a new value the way React does, straight onto the original TextNode.
   * On an engine that detached that node the screen will not change: the freeze.
   */
  async function frameworkWrite(probe, nextValue) {
    var node = firstTextNode(probe)
    if (!node) return notApplicable('probe has no text node')

    var visibleBefore = probe.host.textContent
    Recorder.noteSelfOp('frameworkWrite ' + probe.id)
    node.nodeValue = nextValue
    await flushOwnRecords()

    var reaction = await Recorder.waitForMutation(probe.host, patience)
    var visibleAfter = probe.host.textContent

    return {
      applicable: true,
      wrote: nextValue,
      nodeWasConnected: node.isConnected,
      visibleBefore: visibleBefore,
      visibleAfter: visibleAfter,
      visibleTextChanged: visibleAfter !== visibleBefore,
      valueReachedScreen: visibleAfter.indexOf(nextValue.replace(/\D+/g, '')) !== -1,
      translatorReactedAfterMs: reaction ? reaction.delayMs : null,
    }
  }

  /**
   * The decisive test for mirror-into-wrapper: we write our value into the
   * translator's own element and watch whether it overwrites us.
   */
  async function wrapperWrite(probes, nextValue) {
    var probe = probeWithWrapper(probes, ['number-only', 'simple', 'plural-many', 'digits'])
    if (!probe) return notApplicable('this engine injected no wrapper element anywhere')
    var wrapper = Recorder.wrapperOf(probe.host)

    Recorder.noteSelfOp('wrapperWrite ' + probe.id)
    wrapper.textContent = nextValue
    await flushOwnRecords()

    var reaction = await Recorder.waitForMutation(wrapper, patience)
    if (!reaction) reaction = await provoke(wrapper)
    await sleep(250)

    return {
      applicable: true,
      probeId: probe.id,
      wrote: nextValue,
      wrapperTag: wrapper.tag || wrapper.tagName,
      survived: wrapper.textContent === nextValue,
      textAfter: wrapper.textContent,
      overwrittenAfterMs: reaction ? reaction.delayMs : null,
    }
  }

  /**
   * Replicates what restore-and-retranslate libraries do (translation-resilience's
   * restoreGroup): put the original node back, drop the wrapper, and let the engine
   * catch up. The gap measured here is the untranslated window.
   */
  async function untranslatedWindow(probes) {
    var probe = probeWithWrapper(probes, ['conditional', 'simple', 'list', 'plural-many'])
    if (!probe) return notApplicable('this engine injected no wrapper element anywhere')
    var wrapper = Recorder.wrapperOf(probe.host)
    var node = firstTextNode(probe)
    if (!node) return notApplicable('probe has no text node')

    var parent = wrapper.parentNode
    if (!parent) return notApplicable('wrapper is not attached')

    var restoredNodeValue = node.nodeValue
    Recorder.noteSelfOp('untranslatedWindow ' + probe.id)
    parent.insertBefore(node, wrapper)
    parent.removeChild(wrapper)
    await flushOwnRecords()

    var restoredText = probe.host.textContent
    var reaction = await Recorder.waitForMutation(probe.host, patience)
    var neededProvocation = false
    if (!reaction) {
      reaction = await provoke(probe.host)
      neededProvocation = reaction !== null
    }

    return {
      applicable: true,
      probeId: probe.id,
      patienceMs: patience,
      restoredNodeValue: restoredNodeValue,
      restoredNodeStillHeldSourceText: restoredNodeValue === probe.before,
      restoredText: restoredText,
      retranslatedAfterMs: reaction ? reaction.delayMs : null,
      neededProvocation: neededProvocation,
      textAfter: probe.host.textContent,
      retranslated: reaction !== null && probe.host.textContent !== restoredText,
    }
  }

  /**
   * Adds brand new content after the page was translated and measures how long the
   * engine takes to notice it.
   */
  async function lateContent(probe, text) {
    var line = document.createElement('p')
    line.appendChild(document.createTextNode(text))

    Recorder.noteSelfOp('lateContent ' + probe.id)
    probe.host.appendChild(line)
    await flushOwnRecords()

    var reaction = await Recorder.waitForMutation(line, patience)
    var neededProvocation = false
    if (!reaction) {
      reaction = await provoke(line)
      neededProvocation = reaction !== null
    }

    return {
      applicable: true,
      patienceMs: patience,
      inserted: text,
      translatedAfterMs: reaction ? reaction.delayMs : null,
      neededProvocation: neededProvocation,
      textAfter: line.textContent,
      translated: line.textContent !== text,
    }
  }

  /**
   * Drives a value at a fixed rate and counts how hard the engine works in response.
   * More engine reactions than writes means we are in a retranslation loop.
   */
  async function burst(probe, updatesPerSecond, seconds) {
    var node = firstTextNode(probe)
    if (!node) return notApplicable('probe has no text node')

    var interval = Math.round(1000 / updatesPerSecond)
    var writes = 0
    var engineReactions = 0

    var unsubscribe = Recorder.onMutation(function (mutation, entry) {
      if (!probe.host.contains(mutation.target) && mutation.target !== probe.host) return
      if (entry.sinceSelfOpMs !== null && entry.sinceSelfOpMs < 30) return
      engineReactions += 1
    })

    var deadline = Date.now() + seconds * 1000
    while (Date.now() < deadline) {
      writes += 1
      Recorder.noteSelfOp('burst ' + probe.id + ' #' + writes)
      node.nodeValue = 'There are ' + (writes % 9 + 1) + ' lights!'
      await sleep(interval)
    }

    await sleep(1500)
    unsubscribe()

    return {
      applicable: true,
      updatesPerSecond: updatesPerSecond,
      seconds: seconds,
      writes: writes,
      engineReactions: engineReactions,
      reactionsPerWrite: writes ? Math.round((engineReactions / writes) * 100) / 100 : 0,
      visibleAfter: probe.host.textContent,
    }
  }

  global.Experiments = {
    setPatience: setPatience,
    frameworkWrite: frameworkWrite,
    wrapperWrite: wrapperWrite,
    untranslatedWindow: untranslatedWindow,
    lateContent: lateContent,
    burst: burst,
  }
})(window)
