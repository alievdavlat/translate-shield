import { readFile } from 'node:fs/promises'

const MUST_HAVE = ['dist/react.js', 'dist/react.cjs']
const MUST_NOT_HAVE = ['dist/index.js', 'dist/index.cjs']

const PROLOGUE =
  /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*(?:["']use strict["'];\s*)?["']use client["'];/

/**
 * Gates the one failure that ships silently. A bundler can drop the directive
 * with no warning: the package publishes clean and only breaks inside someone
 * else's Server Component. The absence check matters just as much — a directive
 * on the framework-agnostic entry would drag every consumer's server code across
 * the client boundary.
 */
let failed = false

for (const file of MUST_HAVE) {
  if (PROLOGUE.test(await readFile(file, 'utf8'))) continue
  console.error(`missing "use client" directive in ${file}`)
  failed = true
}

for (const file of MUST_NOT_HAVE) {
  if (!PROLOGUE.test(await readFile(file, 'utf8'))) continue
  console.error(`unexpected "use client" on the framework-agnostic entry ${file}`)
  failed = true
}

if (!failed) console.log('directives ok')
process.exit(failed ? 1 : 0)
