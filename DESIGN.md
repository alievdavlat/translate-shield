# translate-shield design

|          |                                                                                                          |
| -------- | -------------------------------------------------------------------------------------------------------- |
| Status   | Request for comments                                                                                     |
| Scope    | The runtime in `src/` and how it ships. Not the recorder, not the article.                               |
| Audience | Contributors, and maintainers of adjacent shims deciding whether the approach is worth copying           |
| Numbers  | Every measurement quoted here was taken as [research/measurements.md](research/measurements.md) describes |
| Usage    | [README.md](README.md). Prior art: [research/article.md](research/article.md)                            |

---

## The crash is loud, the freeze is silent

Chrome's translator replaces a `TextNode` with `<font style="vertical-align: inherit">` and
detaches the original. React keeps the detached node, so `removeChild` and `insertBefore` throw
`NotFoundError`, while `node.nodeValue = '...'` never throws and never reaches the screen.

The silent one does the damage: it freezes the strings that must not be wrong, prices and
counters and dosages. Static copy is safe. The freeze needs an update, the crash needs a sibling.

## Two engine families, and one of them has the bug

| Engine                                                        | Family    | Wrapper                                  | Creates the freeze |
| ------------------------------------------------------------- | --------- | ---------------------------------------- | ------------------ |
| Chrome built-in                                               | detaching | `<font>` + `vertical-align: inherit`     | yes                |
| Google `translate_a/element.js`, on Chromium, Gecko and WebKit | detaching | same                                     | yes                |
| Yandex                                                        | detaching | `<ya-tr-span>`                           | yes                |
| Edge                                                          | in place  | none, stamps `_msttexthash` / `_msthash` | no                 |
| Firefox                                                       | in place  | none, no markers                         | no                 |
| Safari                                                        | unknown   | unknown                                  | unknown            |

Safari is unmeasured: it does not run on Windows. In-place engines are narrower, not immune: the
three-TextNode probe reported `detached: 2` on both Firefox and Edge, so both detach when merging adjacent text runs, and what they leave behind is unprobed.
Yandex honours `translate="no"` but translated the `class="notranslate"` probe
(`research/fingerprints/yandex-builtin-de-probes.json`).

## Three layers, best reached in order

| Layer            | Mechanism                                                                                                                                                                                                                                        | What it does not do                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| 1 Prevention     | `<NoTranslate>` (`translate-shield/react`), a thin element carrying `translate="no"`, meant to wrap a value and never a sentence. Cheapest correct answer for prices, order numbers, tracking codes and formatted dates.                            | Nothing for prose, which is what the reader turned translation on for |
| 2 Mirroring      | A `MutationObserver` pairs each detached `TextNode` with the wrapper that replaced it. `nodeValue`, `data` and `textContent` are intercepted and forwarded into the wrapper; a digit-only change is spliced into the translated sentence by `mergeIntoTranslated`, in that sentence's own separators and digit system. | Refuses whenever the merge could change meaning                       |
| 3 Crash survival | `Node.prototype.removeChild` and `insertBefore` are wrapped. A real child takes the native path, a detached node is redirected to its linked wrapper, anything else is reported through `onRecoveredError` with `redirected: false` rather than swallowed. | Cannot be scoped to one root                                          |

The merge is timid on purpose: a fluent wrong sentence is worse than a visibly untranslated one.
On any of these gates it refuses, and the reader gets the correct value in the source language,
which is what a restore-based shim shows anyway.

| Gate                                            | What it prevents                                                                             |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `Intl.PluralRules` category differs, old vs new | Russian 4 is `few` and 7 is `many`: `Здесь 4 лампочки!` must never become `Здесь 7 лампочки!` |
| Unknown target locale                           | Guessing plural grammar for a locale that cannot be checked                                   |
| Digit count changed                             | Reflowing a sentence built around a different magnitude                                       |
| Anything outside the numbers changed            | Splicing digits into a sentence that is no longer the same sentence                           |

Layer 3 patches the prototypes globally, the largest compromise here. Every node on the page goes
through the wrapper functions, including nodes owned by other React roots and third-party widgets;
`root` scopes the observer, not the patch. `handle.stop()` is the only exit.

## Where it pays off

| Engine          | Crash fixed | Freeze fixed | Language kept across an update                                                              |
| --------------- | ----------- | ------------ | -------------------------------------------------------------------------------------------- |
| Chrome built-in | yes         | yes          | yes, the reason this exists                                                                 |
| Google bundle   | yes         | yes          | yes                                                                                         |
| Yandex          | yes         | yes          | yes, but no better than a restore-based shim, because Yandex repairs a restored node itself |
| Edge            | not needed  | not needed   | not applicable, no wrapper to write into                                                    |
| Firefox         | not needed  | not needed   | not applicable                                                                              |
| Safari          | unknown     | unknown      | unknown                                                                                     |

On an in-place engine this costs a few kilobytes and does nothing, except in the merged-run case.


```
src/         the library         "translate-shield" and "translate-shield/react"
tests/       does it work        specs, fixtures, and the app they drive
research/    how we know         the recorder, the raw measurements, the write-ups
scripts/     tooling
dist/        generated, and the only thing published
```

Before release:

```
npm run typecheck
npm run build
npx publint --strict
npx @arethetypeswrong/cli --pack .
npx playwright test
```

## Decisions

Accepted 2026-09-02. A wrong entry is superseded, never edited.

Mirror, do not restore. A `MutationObserver` forwards writes into the engine's wrapper; the
original node stays detached. Restore-and-retranslate, what the incumbent ships, puts
source-language text on screen for 150 to 200ms per update and never repairs an element below the
fold. Cost: Yandex repairs restored nodes itself, so there the margin is zero.

Gate the numeric merge on `Intl.PluralRules`. Digits merge only when old and new share a plural
category in the target locale. Ungated, it turned `Здесь 4 лампочки!` into `Здесь 7 лампочки!`.
Cost: on plural-sensitive languages this degrades to what a restore-based shim gives, and the
refusal is silent.

One package, two subpath entries: `.` for the runtime, `./react` for `NoTranslate` and
`useTranslationDetected`, React an optional peer. A monorepo was rejected as two release trains for
packages with no independent life. Cost: a React-only fix bumps the version for runtime-only
consumers. Tarball 11.8 kB.

bunchee over tsup. tsup's own README says it is unmaintained, and neither `banner` nor
`esbuildOptions.banner` applied the client directive in a multi-entry config;
`scripts/assert-directives.mjs` checks it as `postbuild`. Cost: the build shape belongs to a tool we
do not control, and no source maps ship.

`"use client"` on the whole React entry. Splitting finer saves about 150 bytes but depends on the
bundler emitting a directive onto a non-entry chunk every build, and that regression fails a
consumer's Server Component build rather than ours. Cost: a `NoTranslate`-only consumer pays those
bytes.

No ESLint plugin of our own. `eslint-plugin-react-google-translate` already encodes both rules and
is the incumbent by a wide margin, and the one rival that ships a fixer is close to unused.
Cost: a fixer exists only if that maintainer accepts one, so until then there
is no autofix anywhere.

Name the evidence directory `research/`, not `docs/`. One name over exports and documentation reads as one kind of
thing. `files` is `["dist"]`, so none of it ships. Cost:
tooling expecting `docs/` finds nothing, and the raw exports go stale as engines change.

| Decision               | Evidence                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mirror, do not restore | `research/flicker.json`, `research/visibility-confound.json`, `research/head-to-head-real-chrome.json`, `research/fingerprints/yandex-builtin-de.json` |
| Plural gate            | `research/head-to-head-real-chrome.json`, `research/provocation.json`                                                                                 |
| No ESLint plugin       | `research/research-verdict.md`                                                                                                                        |
| Engine families        | `research/fingerprints/`, engine versions in `research/provenance.json`                                                                               |

## Open questions

| # | Question | What turns on it |
| - | -------- | ---------------- |
| 1 | Does `scrollIntoView({block:'nearest'})` wake the translator for an element already fully visible, without moving the page? | Of eleven signals tested from a proven-idle state, `scrollIntoView()` alone woke Chrome, at 158ms. If it fires for a visible element too, the merge-refused path can write source text and hand the sentence back to Google for correct grammar, plural form and number formatting. That makes the fallback better than the incumbent rather than equal to it. Owner: maintainer. |
| 2 | How do we observe open shadow roots, and what does walking them cost on a large page? | Chrome and Yandex translate inside open shadow roots and detach nodes there, invisible to an observer watching `root`. No shim in this space handles them. Roots attached after install are the harder half. Owner: maintainer. |
| 3 | What happens when another shim is installed on the same page? | Mirroring into the wrapper and restoring the original are contradictory operations on the same nodes, and both libraries patch the same prototypes. Untested. Options run from warn-once on an already-patched prototype, to refusing to install, to layering rather than patching over. Owner: maintainer. |
| 4 | What do the in-place engines leave behind in the merged-run detach case? | `detached: 2` on the three-TextNode probe is all that is known for Firefox and Edge. Whether a wrapper exists to mirror into, and whether the freeze is reachable there at all, decides whether the README's "not needed on Edge and Firefox" needs an exception clause. Owner: maintainer. |
| 5 | Safari. | Needs macOS hardware nobody on this project has. Guessing from the WebKit run is not allowed: that run used Google's bundle, not Safari's own translator. Owner: unassigned. |
| 6 | Is a per-root patch reachable at all? | No seam has been found short of reimplementing the React host config. An answer retires the largest compromise in the design. Owner: maintainer. |

## What not to do

Do not recommend `class="notranslate"` on its own. Yandex translated that probe
(`research/fingerprints/yandex-builtin-de-probes.json`), and the advice is repeated widely enough
to be the default mistake.

Do not detect by tag name. A `<font>` from a CMS or from rendered markdown must never arm the
shield. The fingerprint is `wrapper.style.verticalAlign` read off the inline `style` attribute,
because `getComputedStyle` resolves `inherit` to `baseline`.

Do not loosen the merge to raise its hit rate. Every gate exists because removing it produced
fluent wrong output.

Do not treat `research/fingerprints/simulated-gt-nl.json` as evidence. It is an instrument
control and differs from every real engine.
