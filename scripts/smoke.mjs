import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const failures = []

const check = (name, run) => {
  try {
    run()
  } catch (error) {
    failures.push(`${name}: ${error.message}`)
  }
}

/**
 * Exercises the built artefact the way a consumer's server does: no DOM, both
 * module systems, both entries. Reading `Node.prototype` at module scope once
 * shipped a package that threw `ReferenceError: Node is not defined` on import,
 * and nothing in the browser suite could have caught it.
 */
const esm = await import('../dist/index.js')
const esmReact = await import('../dist/react.js')

check('ESM core exports', () => {
  const missing = ['initTranslateShield', 'mergeIntoTranslated'].filter((name) => !esm[name])
  if (missing.length) throw new Error(`missing ${missing.join(', ')}`)
})

check('ESM init returns an inert handle without a DOM', () => {
  const handle = esm.initTranslateShield()
  const keys = ['stop', 'isTranslated', 'engine', 'conflicts']
  const missing = keys.filter((key) => typeof handle[key] !== 'function')
  if (missing.length) throw new Error(`handle missing ${missing.join(', ')}`)
  if (handle.isTranslated() !== false) throw new Error('isTranslated should be false')
  if (handle.engine() !== null) throw new Error('engine should be null')
  handle.stop()
})

check('merge works with no DOM', () => {
  const merged = esm.mergeIntoTranslated(
    'There are 4 lights!',
    'There are 7 lights!',
    'Er zijn 4 lampen!',
    'nl',
  )
  if (merged !== 'Er zijn 7 lampen!') throw new Error(`got ${merged}`)
})

check('ESM react exports', () => {
  const missing = ['NoTranslate', 'useTranslationDetected'].filter(
    (name) => typeof esmReact[name] !== 'function',
  )
  if (missing.length) throw new Error(`missing ${missing.join(', ')}`)
})

check('CJS core', () => {
  const cjs = require('../dist/index.cjs')
  cjs.initTranslateShield().stop()
})

check('CJS react', () => {
  const cjs = require('../dist/react.cjs')
  if (typeof cjs.NoTranslate !== 'function') throw new Error('NoTranslate missing')
})

check('the exports map seals internals', () => {
  try {
    require.resolve('translate-shield/dist/react.js')
  } catch {
    return
  }
  throw new Error('a deep import resolved that the exports map should refuse')
})

if (failures.length) {
  console.error('smoke failed:')
  for (const failure of failures) console.error(`  ${failure}`)
  process.exit(1)
}
console.log('smoke ok')
