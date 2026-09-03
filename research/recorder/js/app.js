/* global window, document, navigator, Probes, Recorder, Experiments */
;(function (global) {
  'use strict'

  var report = {
    schema: 'translate-shield/engine-fingerprint/1',
    meta: {},
    fingerprint: null,
    experiments: {},
    mutations: [],
    notes: '',
  }

  var probes = []
  var armed = false

  function byId(id) {
    return document.getElementById(id)
  }

  function probeById(id) {
    return probes.filter(function (probe) {
      return probe.id === id
    })[0]
  }

  function setStatus(text, tone) {
    var element = byId('status')
    element.textContent = text
    element.className = 'status status-' + (tone || 'idle')
  }

  function collectMeta() {
    var brands = navigator.userAgentData && navigator.userAgentData.brands
    return {
      recordedAtIso: new Date().toISOString(),
      userAgent: navigator.userAgent,
      brands: brands ? brands.map(function (b) { return b.brand + ' ' + b.version }) : null,
      platform: (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform,
      language: navigator.language,
      languages: navigator.languages,
      pageUrl: global.location.href,
      pageLangAttribute: document.documentElement.lang || '',
      engineLabel: byId('engine-label').value.trim(),
      targetLanguage: byId('target-language').value.trim(),
    }
  }

  function renderResult(key, value) {
    var box = byId('results')
    var block = document.createElement('div')
    block.className = 'result'

    var title = document.createElement('h4')
    title.textContent = key
    block.appendChild(title)

    var body = document.createElement('pre')
    body.textContent = JSON.stringify(value, null, 2)
    block.appendChild(body)

    box.insertBefore(block, box.firstChild)
  }

  function handleArm() {
    if (armed) return
    probes = Probes.build(byId('probes'))
    Recorder.rememberOriginalValues(probes)
    Recorder.start()
    armed = true
    global.__probes = probes
    byId('btn-arm').disabled = true
    byId('btn-capture').disabled = false
    setStatus('Armed. Now turn on your browser translation, then press Capture.', 'armed')
    startLiveCounter()
  }

  function startLiveCounter() {
    global.setInterval(function () {
      var count = Recorder.state.mutations.length
      var detected = Recorder.state.firstForeignMutationAt !== null
      byId('counter').textContent =
        count + ' mutations recorded' + (detected ? ' — foreign activity detected' : '')
    }, 500)
  }

  function handleCapture() {
    if (!armed) return
    report.meta = collectMeta()
    report.fingerprint = Recorder.snapshot(probes)
    byId('btn-experiments').disabled = false
    byId('btn-save').disabled = false
    byId('btn-export').disabled = false
    byId('btn-copy').disabled = false
    renderResult('fingerprint', report.fingerprint)

    var detached = report.fingerprint.probes.reduce(function (total, probe) {
      return total + probe.detachedTextNodes
    }, 0)
    var inPlace = report.fingerprint.probes.reduce(function (total, probe) {
      return total + probe.textNodesMutatedInPlace
    }, 0)

    if (detached === 0 && inPlace === 0) {
      setStatus('No translation detected yet. Translate the page, then press Capture again.', 'warn')
      return
    }
    if (detached === 0 && inPlace > 0) {
      setStatus(
        'IN-PLACE ENGINE: text nodes were mutated, not detached. This engine does not create the React bug.',
        'good',
      )
      return
    }
    setStatus(
      'DETACHING ENGINE: ' + detached + ' original text nodes were detached. Run the experiments.',
      'bad',
    )
  }

  async function handleExperiments() {
    byId('btn-experiments').disabled = true
    var steps = [
      {
        key: 'frameworkWrite',
        run: function () {
          return Experiments.frameworkWrite(probeById('simple'), 'There are 7 lights!')
        },
      },
      {
        key: 'wrapperWrite',
        run: function () {
          return Experiments.wrapperWrite(probes, '77')
        },
      },
      {
        key: 'untranslatedWindow',
        run: function () {
          return Experiments.untranslatedWindow(probes)
        },
      },
      {
        key: 'lateContent',
        run: function () {
          return Experiments.lateContent(probeById('dynamic'), 'There are 8 lights added late!')
        },
      },
      {
        key: 'burstOneHz',
        run: function () {
          return Experiments.burst(probeById('burst-target'), 1, 5)
        },
      },
    ]

    for (var index = 0; index < steps.length; index += 1) {
      var step = steps[index]
      setStatus('Running experiment ' + (index + 1) + '/' + steps.length + ': ' + step.key, 'busy')
      var result = await step.run()
      report.experiments[step.key] = result
      renderResult(step.key, result)
    }

    setStatus('Experiments done. Export the JSON.', 'good')
    byId('btn-export').disabled = false
    byId('btn-copy').disabled = false
  }

  function buildReport() {
    report.notes = byId('notes').value
    report.mutations = Recorder.state.mutations
    report.mutationsDropped = Recorder.state.dropped
    report.selfOps = Recorder.state.selfOps
    return report
  }

  function fileName() {
    var engine = (byId('engine-label').value.trim() || 'engine').replace(/[^a-z0-9-]+/gi, '-')
    var target = (byId('target-language').value.trim() || 'xx').replace(/[^a-z0-9-]+/gi, '-')
    return 'fingerprint-' + engine.toLowerCase() + '-' + target.toLowerCase() + '.json'
  }

  function handleExport() {
    var blob = new Blob([JSON.stringify(buildReport(), null, 2)], { type: 'application/json' })
    var url = URL.createObjectURL(blob)
    var link = document.createElement('a')
    link.href = url
    link.download = fileName()
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  function handleSave() {
    var body = JSON.stringify({ filename: fileName(), content: JSON.stringify(buildReport(), null, 2) })
    fetch('/save-fingerprint', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body,
    })
      .then(function (response) {
        return response.json()
      })
      .then(function (result) {
        if (!result.ok) throw new Error(result.error || 'save failed')
        setStatus('Saved to ' + result.path + ' — you can close this tab.', 'good')
      })
      .catch(function (error) {
        setStatus('Could not save into the repo (' + error.message + '). Use Download JSON instead.', 'warn')
      })
  }

  function handleCopy() {
    var text = JSON.stringify(buildReport(), null, 2)
    var output = byId('json-output')
    output.value = text
    output.hidden = false
    output.select()
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(function () {})
    }
    setStatus('JSON is in the box below and on your clipboard.', 'good')
  }

  function applyUrlParams() {
    var params = new URLSearchParams(global.location.search)
    if (params.get('patience')) Experiments.setPatience(Number(params.get('patience')))
    if (params.get('engine')) byId('engine-label').value = params.get('engine')
    if (params.get('target')) byId('target-language').value = params.get('target')
    if (params.has('autoarm')) handleArm()
  }

  function init() {
    byId('btn-arm').addEventListener('click', handleArm)
    byId('btn-capture').addEventListener('click', handleCapture)
    byId('btn-experiments').addEventListener('click', handleExperiments)
    byId('btn-save').addEventListener('click', handleSave)
    byId('btn-export').addEventListener('click', handleExport)
    byId('btn-copy').addEventListener('click', handleCopy)
    setStatus('Press Arm before translating anything.', 'idle')
    applyUrlParams()
  }

  document.addEventListener('DOMContentLoaded', init)
})(window)
