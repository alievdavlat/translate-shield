# translate-shield

![translate-shield](https://raw.githubusercontent.com/alievdavlat/translate-shield/main/research/screenshots/banner.png)

[![npm](https://img.shields.io/npm/v/translate-shield)](https://www.npmjs.com/package/translate-shield)
[![bundle size](https://img.shields.io/bundlephobia/minzip/translate-shield)](https://bundlephobia.com/package/translate-shield)
![dependencies](https://img.shields.io/badge/dependencies-0-2ea44f)
[![licence](https://img.shields.io/npm/l/translate-shield)](LICENSE)

`NotFoundError: Failed to execute 'removeChild' on 'Node'` after a reader turns on Chrome
translation. Or a counter that freezes while the rest of the app works.

Chrome replaces your TextNode with `<font style="vertical-align: inherit">` and detaches the
original. React still holds the detached node, so `removeChild` and `insertBefore` throw and text
writes go nowhere.

```bash
npm install translate-shield
```

```ts
import { initTranslateShield } from 'translate-shield'

initTranslateShield()
```

The whole setup. No-op on the server, armed only after a translator rewrites the page, inert on
engines that do not need it. No dependencies, about 15 kB packed.

Firefox and Edge readers do not hit this bug. Check [Browser support](#browser-support) first.

## See it happen

[Live demo](https://google-translate-simulation.netlify.app/). Two identical React apps side by
side, one shielded and one not, while your own browser translates them. Turn translation on and the
unprotected one freezes and then unmounts. It runs on real translation rather than a recording, so
on Edge and Firefox both panels correctly behave the same and the page says so.

## What the reader sees

Four updates to a value in view, real Chrome, live Dutch translation.

| | No protection | The pasted crash guard | A restore-based library | translate-shield |
|---|---|---|---|---|
| `NotFoundError` crash | app unmounts | fixed | fixed | fixed |
| Value keeps updating | frozen | still frozen | yes | yes |
| Removed text disappears | n/a | stays on screen | yes | yes |
| Language while updating | n/a | n/a | 100-150 ms of source language per update | 0 ms |
| Text when the reader looks | `Er zijn 4 lampen!`, stale | n/a | `There are 7 lights!` | `Er zijn 7 lampen!` |

First three rows: `research/comparison.json`. Language row: `research/flicker.json`, five
replicates of four updates, where restore-and-retranslate spends 500 to 600 ms of the sequence in
source language and mirroring 0 ms in all twenty. Last row:
`research/head-to-head-real-chrome.json`.

## Next.js

Call the initializer from a client component in the root layout.

```tsx
'use client'

import { useEffect } from 'react'
import { initTranslateShield } from 'translate-shield'

export const TranslateShield = () => {
  useEffect(() => initTranslateShield().stop, [])
  return null
}
```

```tsx
import { TranslateShield } from './translate-shield'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TranslateShield />
        {children}
      </body>
    </html>
  )
}
```

A second call returns the existing handle, so a double-invoked development effect leaves one
shield.

### The hydration warning is not this library

A translated page produces this before any of the above runs:

```
A tree hydrated but some attributes of the server rendered HTML didn't match the client properties.
-  lang="ru"
-  className="... translated-ltr"
```

The translator rewrites the document root and a set of text-carrying attributes while the page is
still loading, so React hydrates against a DOM the server never sent.

| Surface | What the translator does | Evidence |
|---|---|---|
| `<html lang>` | rewritten to the target language, on every engine recorded | `research/root-attributes.json`, `research/fingerprints/` |
| `<html class>` | Chrome appends `translated-ltr` | `research/root-attributes.json` |
| `alt`, `title`, `placeholder`, `aria-label`, submit `value` | translated in place | `research/attributes.json` |
| `data-*` attributes, `meta[name=description]` | left alone | `research/attributes.json` |

Nothing here causes it and nothing here can prevent it: it happens before hydration, and
`initTranslateShield` runs after. React keeps the translator's value either way, so this is a
warning about the console, not a broken page. Two fixes, depending on what the attribute holds.

Text that should be translated, which is most `alt` and `aria-label` copy:

```tsx
<html lang="en" suppressHydrationWarning>
```

`suppressHydrationWarning` covers one element's own attributes, so the root needs it for `lang` and
`class`, and any element whose `alt` or `title` you want translated needs its own.

Text that should not be translated, such as a code, a price or an order number, opts out instead,
and the opt-out covers the attribute as well as the text:

```tsx
<img translate="no" className="notranslate" alt="Order PIN-4417-02" />
```

All three opt-out probes held on Chrome (`research/attributes.json`). That is the same guarantee
`NoTranslate` relies on.

## Protecting a value

```tsx
import { NoTranslate } from 'translate-shield/react'

export const OrderTotal = ({ total }: { total: number }) => (
  <p>
    Order total: <NoTranslate>{formatPrice(total)}</NoTranslate> including VAT
  </p>
)
```

The sentence is translated; the price is not. Use it for prices, counters, order numbers,
tracking codes, IBANs and dates, never prose. Every real engine recorded honours `translate="no"`
(`research/fingerprints/summary.json`); `NoTranslate` also sets `class="notranslate"`, because
Yandex translated the class probe anyway (`research/measurements.md`).

## Detecting a translated page

```tsx
'use client'

import { useTranslationDetected } from 'translate-shield/react'

export const TranslationBanner = () => {
  const { isTranslated, engine, lang } = useTranslationDetected()
  if (!isTranslated) return null
  return <p>Machine translated to {lang} by {engine}.</p>
}
```

Idle on the server and on the first client render, so no hydration mismatch. `engine` is
`'google'`, `'yandex'`, `'edge'`, `'firefox'`, or `null`.

## API

### `initTranslateShield(options?): ShieldHandle`

| Option | Type | Default | Meaning |
|---|---|---|---|
| `root` | `Element` | `document.body` | Subtree to observe |
| `wrapperTags` | `string[]` | `[]` | Extra wrapper tag names to recognise beyond the built-in fingerprints |
| `onTranslationDetected` | `(info: TranslationInfo) => void` | none | Called once, with `lang`, `engine`, and `wrapperTag` |
| `onRecoveredError` | `(error: RecoveredError) => void` | none | Called when `removeChild`, `insertBefore` or `replaceChild` was redirected instead of throwing |
| `onConflict` | `(surfaces: PatchedSurface[]) => void` | none | Called at install when another shim has already replaced a DOM surface |
| `debug` | `boolean` | `false` | Log every detection and recovery to the console |

`ShieldHandle` carries `stop()`, `isTranslated()`, `engine()`, and `conflicts()`. On the server it
is inert.

Two shims on one page is a silent draw, not a crash: whichever repairs second decides, and the
other quietly does nothing. `conflicts()` names any DOM surface already replaced when the shield
installed, and a console warning fires whether or not you pass `onConflict`.

### `mergeIntoTranslated(previousSource, nextSource, translated, locale): string`

Writes changed digits into a sentence the translator already produced.

| Outcome | What the reader gets |
|---|---|
| Merged | the translated sentence, keeping its separators and digit system: `19,99` updated from `29.99` becomes `29,99` |
| Refused | `nextSource` untranslated, so the value is right and the language is not (`research/head-to-head-real-chrome.json`, Russian arm) |

| Refuses when | Because |
|---|---|
| `Intl.PluralRules` puts the old and the new value in different categories for `locale` | Russian `4` is `few` and `7` is `many`, so `Здесь 4 лампочки!` never becomes `Здесь 7 лампочки!` |
| The sentence around the numbers changed, not just the numbers | The translation no longer matches the new source |
| The digit count changed | The positions no longer line up |
| The locale is empty or unknown to `Intl.PluralRules` | Grammar cannot be checked |

## Browser support

Rows: `research/fingerprints/summary.json`, recorded on Windows 2026-09-02; versions in
`research/provenance.json`.

| Engine | Wrapper | Detaches the original | Does this library help |
|---|---|---|---|
| Chrome built-in | `<font style="vertical-align: inherit">` | yes | yes |
| Google `translate_a/element.js` bundle | `<font style="vertical-align: inherit">` | yes | yes |
| Yandex | `<ya-tr-span>` | yes | crash and frozen values only |
| Edge built-in | none, stamps `_msttexthash` / `_msthash` | no | no |
| Firefox built-in | none, no markers | no | no |
| Safari built-in | unmeasured | unknown | unknown |

Firefox and Edge rewrite the text node in place and leave it connected, so React's writes reach
the screen. Three qualifications:

| Qualification | Evidence |
|---|---|
| In-place engines do detach when they merge adjacent text runs | the three-TextNode `interpolated` probe reports two detached nodes on Firefox and on Edge, against three on Chrome and Yandex |
| On Yandex the detached node already holds translated text, so the language row does not apply there; the crash and freeze fixes do | `research/measurements.md` |
| Safari does not run on Windows and is unmeasured | the WebKit recording, `google-element-webkit-nl.json`, is the Google bundle under WebKit, not Safari's own translator |

## Limits

- It does not translate anything or replace an i18n library.
- It does not stop the translator rewriting text; `NoTranslate` does.
- Beyond what `mergeIntoTranslated` verifies, a value merged into a neighbouring sentence is
  unprotected: on refusal it is correct but in the source language.
- Safari behaviour is unknown, not assumed.

Why it works this way: [DESIGN.md](DESIGN.md).

## Prior art

| Prior work | What it does |
|---|---|
| [facebook/react#11538](https://github.com/facebook/react/issues/11538) | Where the crash was described. shuhei identified the sibling condition in 2018; Dan Abramov closed it as won't-fix the same year. The guard people paste into their apps comes from that thread and stops the crash without unfreezing anything. |
| [`translation-resilience`](https://www.npmjs.com/package/translation-resilience) by Alex Speller, first published 2026-07-10 | Fixes the crash and the frozen value by restoring the original node and letting the translator catch up. That is the strategy the language row measures. |
| `react-google-translate-shim` | A similar restore-based approach. |
| [`eslint-plugin-react-google-translate`](https://www.npmjs.com/package/eslint-plugin-react-google-translate) | Catches the risky JSX patterns at lint time. Worth running alongside this. |

The full comparison: `research/article.md`.

## Reproducing the measurements

Every figure comes from `research/`, produced by a spec in `tests/specs/`.

```bash
npx playwright test flicker                    # research/flicker.json
npx playwright test visibility-confound        # research/visibility-confound.json
npx playwright test provocation                # research/provocation.json
npx playwright test head-to-head-real-chrome   # research/head-to-head-real-chrome.json
```

Recordings under `research/fingerprints/` come from `research/recorder`, driven by hand in each
browser (`research/recorder/README.md`).

```bash
npm run summarise
npm run typecheck
npm run build
npx publint --strict
npx @arethetypeswrong/cli --pack .
npx playwright test
```

## Licence

MIT, Davlatbek Aliev
