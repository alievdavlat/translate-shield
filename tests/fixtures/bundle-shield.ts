import { buildSync } from 'esbuild'

/**
 * Bundles the shield into a single self-contained script for injection into a
 * real browser. The published build cannot be used directly: bunchee splits a
 * shared chunk, so neither dist/index.js nor dist/index.cjs resolves on its own
 * inside a page. Bundling from source here also means the end-to-end runs always
 * exercise the current code rather than a stale dist.
 *
 * The global assignment is part of the returned script on purpose. An IIFE
 * bundle declares `var TranslateShield`, and Playwright evaluates init scripts
 * inside a function, so without this the global never exists and the injection
 * fails silently — which is exactly how an earlier run of the comparison
 * produced a meaningless result.
 */
export const bundleShield = (): string => {
  const result = buildSync({
    entryPoints: ['src/index.ts'],
    bundle: true,
    format: 'iife',
    globalName: 'TranslateShield',
    platform: 'browser',
    target: 'es2020',
    write: false,
  })

  const output = result.outputFiles[0]
  if (!output) throw new Error('esbuild produced no output for the shield bundle')
  return `${output.text}
;window.TranslateShield = TranslateShield;`
}
