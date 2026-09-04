# What browser translators do to a live DOM

Turn on Chrome's translator and a React counter stops counting. The value increments in memory. The screen keeps the old number.

Chrome's translator does not edit your text node. It builds a new one, wraps it in `<font style="vertical-align: inherit">`, puts that where your node was, and detaches yours. React's reference now points at an orphan. `removeChild` and `insertBefore` throw `NotFoundError`, and text writes land where nobody reads them. One React app, three configurations (`research/comparison.json`, `npx playwright test comparison`):

| Configuration | Result |
|---|---|
| no protection | two uncaught `NotFoundError` throws from `removeChild` unmounted the whole root, buttons included |
| the widely pasted crash guard, which no-ops `removeChild` and `insertBefore` when the node is not a child | zero errors and no updates: counter stuck at `Er zijn 4 lampen!` after an increment, price at `Totaal: 19.99 EUR` after a raise, deleted text still on screen, a flipped ternary rendering both branches as `AlternatiefText 5 and more einde.` |
| `translate-shield` | zero errors and every update landed: counter at `Er zijn 5 lampen!`, price at `Totaal: 29.99 EUR`, deleted text gone, the flipped ternary rendering one branch as `Text 5 and more einde.` |

The guard buys silence, not correctness.

Every figure below comes from a file in `research/`, measured 2026-09-02 on Windows 10. The recorder page (`research/recorder/`) snapshots each original text node, waits for a human to turn on translation, then runs sixteen probes and five experiments into `research/fingerprints/`. Playwright drives real Chrome through a seeded profile for the timings. Versions and timestamps: `research/provenance.json`.

| Engine | Driven by | Browser |
|---|---|---|
| Chrome built-in | seeded profile, auto-translate | Chrome 151.0.0.0 |
| Edge built-in | a human accepting the prompt | Edge 152.0.0.0 |
| Firefox built-in | a human accepting the prompt | Firefox 155.0 |
| Yandex built-in | a human accepting the prompt | Yandex Browser 26.8.0.0 |
| Google `translate_a/element.js` | the bundle, loaded directly | Chromium 151.0.7922.34, Firefox 153.0, WebKit |

## Two families of engine, one bug

| | Detaching | In place |
|---|---|---|
| Engines | Chrome built-in, the Google bundle on Chromium, Gecko and WebKit, Yandex | Edge, Firefox |
| What lands in the DOM | a wrapper element (`<font>`, `<ya-tr-span>`), original node detached | the live text node is rewritten, no wrapper element |
| Marker left behind | `style="vertical-align: inherit"` and `dir` on Google's `<font>`; `data-translation`, `data-value`, `data-source-lang` and five more on `<ya-tr-span>` | Edge stamps `_msttexthash` and `_msthash`; Firefox leaves no marker at all |
| React's write reaches the screen | no (`nodeWasConnected: false`) | yes (`nodeWasConnected: true`) |
| Enters open shadow roots | yes | no |
| Notices late content without a user signal | no | yes |

The in-place engines prove the freeze is a choice. A counter driven once a second reached 6 in both, `Er zijn 6 lampen!` in Edge and `Il y a 6 lumières !` in Firefox.

Narrower, not immune. The `interpolated` probe is one paragraph of three adjacent text nodes, `Total: `, `19.99`, ` EUR per order`. Merging them into one sentence costs two: `detached: 2` on Firefox and Edge, against `detached: 3` on Chrome.

Shadow DOM belongs to the detaching family, so a shim watching `document.body` without walking shadow roots misses those displacements. `translate="no"` held on every engine. `class="notranslate"` did not: Yandex translated that probe (`research/fingerprints/yandex-builtin-de-probes.json`), which makes the class an unreliable opt-out.

One detection trap. The usual advice is to recognise Google's wrapper by `vertical-align: inherit`, and through `getComputedStyle` that silently fails. Every detaching fingerprint records `inlineVerticalAlign: "inherit"` with `computedVerticalAlign: "baseline"`, because the cascade resolves `inherit` to the parent's value. Read `wrapper.style.verticalAlign`. Tag names are no detector either.

## Chrome translates the viewport, not the page

Eleven signals, fired from a proven idle state, each against the same untranslated node. One worked. The other ten did nothing within 10 seconds (`research/provocation.json`, `npx playwright test provocation`).

| Signal | Translated? |
|---|---|
| `element.scrollIntoView()` | yes, after 158ms |
| no signal (control) | no |
| forced layout read | no |
| synthetic `visibilitychange` | no |
| synthetic window `focus` | no |
| synthetic `resize` | no |
| synthetic `mousemove` | no |
| `scrollBy(0, 1)` and back | no |
| `scrollTo(bottom)` and back | no |
| trusted mouse wheel | no |
| trusted mouse move | no |

Two of those failures were real wheel and move events from the browser, so trusted input is not the trigger, and neither is scrolling the window. The element entering the viewport is.

Late content obeys the same rule. A node appended after translation sat in English for the full 20 second Chrome wait, then translated once scrolled into view.

| Engine and target | Late content translated |
|---|---|
| Chrome | 80.5ms after `scrollIntoView` |
| Google bundle, Chromium into Russian | 70ms after signal |
| Google bundle, Chromium into Arabic | 96.7ms after signal |
| Google bundle, Gecko | 110ms after signal |
| Google bundle, WebKit | 311ms after signal |
| Google bundle, Chromium into Dutch | 4198.6ms after signal |
| Yandex | 106.1ms after signal |
| Firefox | 40ms, no signal |
| Edge | yes, no signal |

Chrome's translator is not a MutationObserver over your page. It re-scans what becomes visible, and a node it has taken away never returns to scope.

## The headline conclusion was wrong

This study had already written down that a restored text node is never re-translated. That probe sat below the fold.

With the element in view, Chrome repaired the restored node in 211ms. Off screen it never did, however long the test waited (`research/visibility-confound.json`). The control arm in the same file caught it: text written into the translator's wrapper displayed immediately in both placements, and was never overwritten. A probe that only ever ran below the fold would have shipped the wrong claim.

Two more fell the same way. A head-to-head was invalidated on its first run because one library had silently failed to load: the bundle ends with a `//# sourceMappingURL=` line comment, and an appended global assignment landed inside it. Every arm now proves which `Node.prototype` methods it patched. And an overclaim about Firefox: three runs with a once-a-second counter all reached 6 on screen, but two ended in French and one in English (`research/fingerprints/firefox-builtin-fr.json` and two replicates in `research/fingerprints/attempts/`). Under sustained updates an in-place engine can fall behind and show source-language text.

## What a repair costs the reader

Restoring the original node and letting the translator retranslate it puts source-language text on screen for 100 to 150ms per update. Mirroring the new value into the translator's own wrapper shows it for 0ms. Both end correct and translated. Five replicates of four updates, visible text sampled every 50ms for 1.5s after each one (`research/flicker.json`, `npx playwright test flicker`).

| Across the 20 updates | Restore and retranslate | Mirror into the wrapper |
|---|---|---|
| Shortest update | 100ms of source language | 0ms |
| Median update | 150ms | 0ms |
| Longest update | 150ms | 0ms |
| A sequence of four | 500 to 600ms | 0ms |

A price that changes once is a flash nobody reports. A counter pays it every tick.

This section previously read 150 to 200ms per update and 700ms per sequence, taken from a single run. Five replicates do not reproduce it, and the report now keeps all of them, because the cost is however long Chrome takes to notice a restored node, and one run of that is not a fact about the strategy. Sampling every 50ms also quantises every figure here to 50ms.

Two limits. The figure came from a probe page with one text node under observation, not a production component tree. And it is Chrome-shaped: on Yandex a restored node comes back already translated (`Es gibt 4 Lichter!`), because Yandex overwrites the detached original and keeps the source string in the wrapper's `data-value`. It re-wrapped that node 454.9ms later, showing no source-language text at all.

Nothing overwrites a mirrored write. `wrapperWrite` survived on Chrome, Yandex and the bundle in every run, before and after provocation.

## Who got here first

The survey ran on 2026-09-02. Three of the four features this project took for novel were already occupied.

| Prior work | What it does | What it does not do |
|---|---|---|
| shuhei in [facebook/react#11538](https://github.com/facebook/react/issues/11538), 2018-05-19 | names the required-sibling condition with repros for both cases; the crash guard in the thread stops the throw | Dan Abramov closed it won't-fix; the guard leaves the freeze and masks genuine `removeChild` bugs in your own code |
| [`eslint-plugin-react-google-translate`](https://www.npmjs.com/package/eslint-plugin-react-google-translate) (getcouped, Mar 2024) | `no-conditional-text-nodes-with-siblings` and `no-return-text-nodes`, catching the JSX shapes before the code ships; 510,761 downloads/month | no fixer: no `fixable` key anywhere in the published tarball |
| [`translation-resilience`](https://www.npmjs.com/package/translation-resilience) (Alex Speller, MIT, first published 2026-07-10) | patches `removeChild`, `insertBefore`, `appendChild` and the `nodeValue` setter; fixes crash and stale value by reinserting the originals and letting the translator retranslate | never writes into the visible `<font>`, so every update shows a flash of source language; no numeric handling, a grep of its `dist` for digit logic returns nothing |

Download counts in this niche are spiky enough to be worth little. The lint plugin is the one thing developers reliably install.

## The library

`translate-shield` is what this study produced: dependency-free, about 15 kB packed, entry points `translate-shield` and `translate-shield/react`. It is on npm as [`translate-shield`](https://www.npmjs.com/package/translate-shield), and the source, every raw recording and the specs that produced them are at [github.com/alievdavlat/translate-shield](https://github.com/alievdavlat/translate-shield). It mirrors the new value into the translator's wrapper rather than restoring the original, which is where the 0ms comes from. On Edge and Firefox it has nothing to do.

Head-to-head in real Chrome, page translated to Dutch, React writing `There are 7 lights!` onto the original detached node, both libraries verified installed by inspecting patched `Node.prototype` methods (`research/head-to-head-real-chrome.json`):

| Arm | Patched | What the reader sees |
|---|---|---|
| no protection | none | `Er zijn 4 lampen!`, frozen at the old value |
| `translation-resilience` | `removeChild`, `insertBefore`, `appendChild`, `nodeValue` setter | `There are 7 lights!`, correct value, English at the moment of reading |
| `translate-shield` | `removeChild`, `insertBefore` | `Er zijn 7 lampen!`, correct value, still Dutch |

Its limit is in the same run: the Russian arm prints English, because the merge refused. Numbers move under translation, and the `digits` probe shows how far. Source string `Prices: 1,234.56 and 21 and 100% on the 3rd of May 2026`:

| Engine and target | Result |
|---|---|
| Chrome, Dutch | `Prijzen: 1.234,56 en 21 en 100% op 3 mei 2026` |
| Google bundle, Russian | `Цены: 1234,56 и 21% и 100% с 3 мая 2026 года.` |
| Google bundle, Arabic | `الأسعار: 1234.56 و21 و100% في 3 مايو 2026` |
| Firefox, French | `Prix: 1.234.56 et 21 et 100% le 3 mai 2026` |

Google turned `21` into `21%` in Russian, Firefox produced `1.234.56`, and at `1` the digit becomes a word: `В комнате всего один светильник.` Grammar is the harder gate. `Здесь 4 лампочки!` must not become `Здесь 7 лампочки!`, which is what an early build shipped: `Intl.PluralRules('ru')` puts 4 in `few` and 7 in `many`, and the noun follows the category. So the merge refuses on a changed plural category, digit count or sentence shape, or an unknown locale, and falls back to the correct value in the source language. The failure it avoids is quiet, and Dutch and German report `other` at every count, so it stays invisible in the languages this work is developed against.

## What is not known

Safari is unmeasured. No Windows build since 2012, Playwright's WebKit carries no translator, and a real run needs macOS and a person willing to click through a translate prompt. The row stays empty rather than guessed.

The flicker figure has not been checked on a real application: one probe page, one Chrome version, two language pairs, four updates.

Three narrower gaps stay open. Whether `scrollIntoView({block: 'nearest'})` wakes the translator for an element already fully visible is untested. The in-place engines' merged-run detach case was not probed. And Yandex's opt-out markers cannot be scored, because too little of that run was translated.

## Reproducing this

| What | How |
|---|---|
| engine exports | `npm run recorder`, served at `http://localhost:5200`; arm, translate, capture, run experiments, save |
| summary | `npm run summarise`, into `research/fingerprints/summary.json` |
| timings | `npx playwright test comparison`, `provocation`, `visibility-confound`, `flicker`, `head-to-head-real-chrome` |

`research/fingerprints/attempts/` keeps replicates and runs where translation never triggered. Those score `createsTheBug: null` rather than `false`, so a failed attempt can never be read as evidence that an engine is safe.
