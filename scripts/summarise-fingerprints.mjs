import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DIRECTORY = 'research/fingerprints'
const SUMMARY_FILE = join(DIRECTORY, 'summary.json')

const probeById = (fingerprint, id) => fingerprint.probes.find((probe) => probe.id === id) || {}

const rowFor = (file) => {
  const report = JSON.parse(readFileSync(join(DIRECTORY, file), 'utf8'))
  const { fingerprint, experiments = {}, meta = {} } = report
  const simple = probeById(fingerprint, 'simple')
  const wrapper = simple.wrapper || {}

  const anyProbeChanged = fingerprint.probes.some((probe) => probe.changed)
  const translationDetected =
    Boolean(fingerprint.langChanged) || (fingerprint.markersFound || []).length > 0 || anyProbeChanged

  return {
    file,
    translationDetected,
    engine: meta.engineLabel || '',
    targetLabel: meta.targetLanguage || '',
    actualTarget: fingerprint.langAfter || '',
    userAgent: meta.userAgent || '',
    wrapperTag: wrapper.tag || null,
    wrapperAttributes: Object.keys(wrapper.attributes || {}).sort(),
    inlineVerticalAlign: wrapper.inlineVerticalAlign ?? null,
    computedVerticalAlign: wrapper.computedVerticalAlign ?? null,
    detachedTextNodes: simple.detachedTextNodes ?? null,
    mutatedInPlace: simple.textNodesMutatedInPlace ?? null,
    createsTheBug: translationDetected ? (simple.detachedTextNodes ?? 0) > 0 : null,
    langChanged: fingerprint.langChanged,
    translateNoHonoured: probeById(fingerprint, 'translate-no').detachedTextNodes === 0,
    notranslateHonoured: probeById(fingerprint, 'notranslate-class').detachedTextNodes === 0,
    shadowDomEntered: (probeById(fingerprint, 'shadow').detachedTextNodes ?? 0) > 0,
    inputValueRewritten: probeById(fingerprint, 'input-value').changed ?? null,
    wrapperWriteSurvived: experiments.wrapperWrite?.survived ?? null,
    restoredTextRetranslated: experiments.untranslatedWindow?.retranslated ?? null,
    lateContentTranslated: experiments.lateContent?.translated ?? null,
    lateNeededProvocation: experiments.lateContent?.neededProvocation ?? null,
    lateTranslatedAfterMs: experiments.lateContent?.translatedAfterMs ?? null,
  }
}

const files = readdirSync(DIRECTORY)
  .filter((file) => file.endsWith('.json') && file !== 'summary.json')
  .sort()

if (files.length === 0) {
  console.log(`No fingerprint exports in ${DIRECTORY}. Run the recorder first.`)
  process.exit(0)
}

const rows = files.map(rowFor)
writeFileSync(SUMMARY_FILE, `${JSON.stringify(rows, null, 2)}\n`)

const columns = [
  ['engine', 22],
  ['targetLabel', 7],
  ['actualTarget', 8],
  ['wrapperTag', 13],
  ['createsTheBug', 14],
  ['mutatedInPlace', 15],
  ['shadowDomEntered', 17],
  ['wrapperWriteSurvived', 21],
  ['restoredTextRetranslated', 25],
  ['lateNeededProvocation', 22],
]

console.log(columns.map(([name, width]) => name.padEnd(width)).join(''))
for (const row of rows) {
  console.log(columns.map(([name, width]) => String(row[name]).padEnd(width)).join(''))
}
console.log(`\n${rows.length} run(s) summarised into ${SUMMARY_FILE}`)
