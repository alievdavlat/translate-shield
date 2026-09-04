# Measured data

Ten recorder exports and five timed Playwright runs, all recorded 2026-09-02 on Windows 10.
Browser build per export: `research/provenance.json`. Raw exports: `research/fingerprints/`,
flattened one row per export into `research/fingerprints/summary.json` by
`scripts/summarise-fingerprints.mjs`. Nine exports are real engines; `simulated-gt-nl.json` is the
project's own control fixture. Translator behaviour is perishable. Every figure below describes
those builds on that date.

## Engines

| Engine and build | Wrapper | Original TextNode | Shadow root | `translate="no"` | `class="notranslate"` | Raw export in `research/fingerprints/` |
|---|---|---|---|---|---|---|
| Chrome 151.0.0.0 built-in | `<font>`, attributes `dir`, `style` | detached | entered | honoured | honoured | `chrome-builtin-nl.json` |
| Google `translate_a/element.js` on Chrome 151.0.7922.34 headless | `<font>`, `dir`, `style` | detached | entered | honoured | honoured | `google-element-nl.json`, `google-element-ru.json`, `google-element-ar.json` |
| Google bundle on Firefox 153.0 | `<font>`, `dir`, `style` | detached | entered | honoured | honoured | `google-element-firefox-nl.json` |
| Google bundle on Playwright WebKit, UA `Version/26.5 Safari/605.1.15` | `<font>`, `dir`, `style` | detached | entered | honoured | honoured | `google-element-webkit-nl.json` |
| Yandex 26.8.0.0 | `<ya-tr-span>`, `data-ch`, `data-index`, `data-source-lang`, `data-target-lang`, `data-translated`, `data-translation`, `data-type`, `data-value`, `style` | detached | entered | not established | not established | `yandex-builtin-de.json` |
| Edge 152.0.0.0 built-in | none; markers `_msttexthash`, `_msthash` stamped on existing elements | mutated in place | not entered | honoured | honoured | `edge-builtin-nl.json` |
| Firefox 155.0 built-in | none; no marker of any kind | mutated in place | not entered | honoured | honoured | `firefox-builtin-fr.json` |
| Control fixture, Chrome 151.0.7922.34 headless | `<font>`, attribute `style` | detached | not entered | honoured | honoured | `simulated-gt-nl.json` |

The `simple` probe is one TextNode. The `interpolated` probe is three adjacent ones, and merging
those is the case where the in-place engines detach too: Edge and Firefox both report
`detachedTextNodes: 2`, against 3 on every wrapper engine.

Both opt-out columns are derived from `detachedTextNodes === 0`, so a probe the engine never
reached reads as honoured. Yandex translates progressively and reached only 3 of 16 probes in
`yandex-builtin-de.json`, so that export settles nothing about its opt-outs. A second Yandex run
reached 7 probes and does settle it: `yandex-builtin-de-probes.json` records `translate="no"`
untouched and `class="notranslate"` translated to `Es gibt 4 Lichter! Insgesamt: 19.99 EUR`, with
`detachedTextNodes: 1`. The class is not a reliable opt-out.

Detection reads `wrapper.style.verticalAlign`: `inherit` on every `<font>` run, empty on the
Yandex wrapper. `getComputedStyle` returns `baseline` and matches nothing.

## Per-engine experiment readings

| Export | Framework write connected / on screen | Write into wrapper survived | Restored source text retranslated | Late content | Five writes at 1 Hz |
|---|---|---|---|---|---|
| `chrome-builtin-nl.json` | false / false | true, `overwrittenAfterMs: null` | false after 20000 ms, probe below the fold | translated, provocation needed, 80.5 ms | counter shows 4, 0 engine reactions |
| `google-element-nl.json` | false / false | true | false | translated, provocation needed, 4198.6 ms | 4, 0 reactions |
| `google-element-ru.json` | false / false | true | false | translated, provocation needed, 70 ms | 4, 0 reactions |
| `google-element-ar.json` | false / false | true | false | translated, provocation needed, 96.7 ms | 4, 0 reactions |
| `google-element-firefox-nl.json` | false / false | true | false | translated, provocation needed, 110 ms | 4, 0 reactions |
| `google-element-webkit-nl.json` | false / false | true | false | translated, provocation needed, 311 ms | 4, 0 reactions |
| `yandex-builtin-de.json` | false / false | true, `wrapperTag: "YA-TR-SPAN"` | false, but the restored node already held the German text from `data-value`; Yandex re-wrapped it 454.9 ms later | translated, provocation needed, 106.1 ms | 4, 0 reactions |
| `edge-builtin-nl.json` | true / true | no wrapper element | no wrapper element | translated, no provocation, `translatedAfterMs: null` | 6, 0 reactions |
| `firefox-builtin-fr.json` | true / true | no wrapper element | no wrapper element | translated, no provocation, 40 ms; replicates 40 ms and 53 ms | 6, 1 reaction; one replicate ended on English `There are 6 lights!` |
| `simulated-gt-nl.json` | false / false | true | true, after 146.8 ms | translated, no provocation, 148.2 ms | 4, 0 reactions |

A framework holding a reference to a detached node writes into a node the screen no longer shows.
The control fixture diverges from every real engine three ways: it retranslates restored text, it leaves number separators unlocalised, and it
does not enter shadow roots.

## Timed runs

| Question | Result | Raw file | Command |
|---|---|---|---|
| What wakes a translator that has gone idle? | `element.scrollIntoView()` on the node, at 158 ms. Ten other candidates and a no-signal control did nothing within 10 s | `research/provocation.json` | `npx playwright test provocation` |
| Does Chrome repair a restored source-language node? | in the viewport, after 211 ms; off screen, not within 15 s | `research/visibility-confound.json` | `npx playwright test visibility-confound` |
| What does restore-and-retranslate cost the reader? | 100 to 150 ms of source-language text per update, 500 to 600 ms across a sequence of four, over five replicates. Mirroring into the wrapper: 0 ms in all twenty updates | `research/flicker.json` | `npx playwright test flicker` |
| Does a shielded value survive Chrome's own translator? | nl: unprotected freezes at 4, `translation-resilience` shows `There are 7 lights!` in English, translate-shield shows `Er zijn 7 lampen!`. ru: translate-shield refuses the merge and shows the English string | `research/head-to-head-real-chrome.json` | `npx playwright test head-to-head-real-chrome` |
| What does a translator write onto `<html>` itself? | Chrome rewrites `lang` from `en` to `ru` and adds `class="translated-ltr"` where there was no class. Every engine recorded rewrites `lang` | `research/root-attributes.json` | `npx playwright test root-attributes-real-chrome` |
| Which attributes get translated, and does an opt-out cover them? | `alt`, `title`, `placeholder`, `aria-label` and a submit `value` are translated; `data-*` and `meta[name=description]` are left alone; `translate="no"` held on all three attribute probes | `research/attributes.json` | `npx playwright test attributes-real-chrome` |
| Does Chrome translate a same-origin iframe? | yes, and it detaches inside it: 4 `<font>` wrappers in both host and child | `research/iframe-scope.json` | `npx playwright test iframe-scope-real-chrome` |
| Crash, corruption, or correct? | no protection throws `NotFoundError: removeChild` twice and React unmounts the root; the community guard throws nothing and freezes the counter at 4, the price at `19.99`, keeps deleted text on screen and leaves a ternary's dead branch; translate-shield updates both values and swaps the branch cleanly | `research/comparison.json` | `npx playwright test comparison --workers=1` |

Method, fixtures and sampling intervals: `research/recorder/README.md`, `tests/specs/` and
`tests/fixtures/branded-browser.ts`. The flicker figures are quantised to 50 ms, since the probe is
sampled every 50 ms across a 1500 ms window.

### Signals tested against an idle Chrome translator

| Signal | Kind | Reaction |
|---|---|---|
| `scrollIntoView` on the node | in-page | 158 ms, text changed to Dutch |
| none (control) | none | none within 10 s |
| forced layout read | in-page | none within 10 s |
| synthetic `visibilitychange` | in-page | none within 10 s |
| synthetic window `focus` | in-page | none within 10 s |
| synthetic `resize` | in-page | none within 10 s |
| synthetic `mousemove` | in-page | none within 10 s |
| `scrollBy(0,1)` and back | in-page | none within 10 s |
| `scrollTo` bottom and back | in-page | none within 10 s |
| trusted mouse wheel | trusted input | none within 10 s |
| trusted mouse move | trusted input | none within 10 s |

All eleven rows carry `reachedIdle: true`, `baselineHeld: true` and `valid: true`. The four
`research/visibility-confound.json` rows carry `reachedIdle: false`, so 211 ms is a repair latency
observed under an active translator, not a response time to the restore itself.

### Flicker per update

Five replicates, four updates each, sampled every 50 ms for 1.5 s after each update. Every figure is quantised to 50 ms.

| Across the 20 updates | Restore and retranslate | Mirror into the wrapper |
|---|---|---|
| shortest update | 100 ms, 2 of 25 samples | 0 ms, 0 of 25 |
| median update | 150 ms, 3 of 25 samples | 0 ms, 0 of 25 |
| longest update | 150 ms, 3 of 25 samples | 0 ms, 0 of 25 |
| a sequence of four | 500 to 600 ms | 0 ms |

Both strategies ended each update on the correct Dutch text.

An earlier single run recorded 150 to 200 ms per update and 700 ms per sequence. None of the five replicates reproduces it, so the report keeps every replicate rather than one run's numbers.

## Numbers and plural forms

Sources: `Prices: 1,234.56 and 21 and 100% on the 3rd of May 2026` and
`There is 1 light in the room.` Plural-sensitive targets ran against the Google bundle only.

| Export | `digits` after | `plural-one` after |
|---|---|---|
| `chrome-builtin-nl.json` | `Prijzen: 1.234,56 en 21 en 100% op 3 mei 2026` | `Er is 1 lamp in de kamer.` |
| `google-element-nl.json` | `Prijzen: 1.234,56 en 21 en 100% op 3 mei 2026` | `Er is 1 lamp in de kamer.` |
| `google-element-ru.json` | `Цены: 1234,56 и 21% и 100% с 3 мая 2026 года.` | `В комнате всего один светильник.` |
| `google-element-ar.json` | `الأسعار: 1234.56 و21 و100% في 3 مايو 2026` | `يوجد ضوء واحد في الغرفة.` |
| `edge-builtin-nl.json` | `Prijzen: 1.234,56 en 21 en 100% op 3 mei 2026` | `Er is één lamp in de kamer.` |
| `firefox-builtin-fr.json` | `Prix: 1.234.56 et 21 et 100% le 3 mai 2026` | `Il y a 1 lumière dans la pièce.` |
| `yandex-builtin-de.json` | untranslated, `changed: false` | untranslated, `changed: false` |

Separators follow the target locale. A standalone `21` became `21%` in Russian, and Firefox produced
`1.234.56`, which is not a valid figure in any locale. At count 1 the number can vanish into a word
(`один`, `واحد`, `één`). Russian changes the noun with the plural category:
`В комнате всего один светильник.` at 1 against `В комнате 5 светильников.` at 5. Dutch changes
form too: Edge returned `Er is één lamp` at 1 and `Er zijn 5 lampjes` at 5. No German or French
plural pair was captured.

## Superseded results

| Number or claim | Why it fell | What replaced it |
|---|---|---|
| The first head-to-head run | `translation-resilience` silently failed to load and nothing in the harness checked, so its arm measured an unprotected page. No raw file was kept, so it cannot be re-examined | `research/head-to-head-real-chrome.json`, which now keeps only runs where every protected arm reports patched `Node.prototype` methods and a present global, the `patchedMethods` column |
| Restore-and-retranslate never recovers | The probe sat below the fold, where Chrome does not translate at all | `research/visibility-confound.json`: the same restore in view is repaired after 211 ms. The surviving claim is narrower, that a restored node is repaired only while it is in the viewport |

## Not measured

Nothing here is a negative result. These are gaps.

| Gap | State of the corpus |
|---|---|
| Safari's own translator | no run. Safari has had no Windows build since 2012. `google-element-webkit-nl.json` measures the Google bundle on Playwright's WebKit, which carries no translator of its own |
| Edge late-content latency | `translatedAfterMs` is `null` while `translated` is `true` |
| Yandex opt-out handling, and Yandex on `digits`, `plural-one`, `plural-many`, `attributes`, `input-value` | those seven probes read `changed: false`, so that run measures Yandex only on the probes it reached |
| Plural-sensitive targets outside the Google bundle | `ru` and `ar` ran against `translate_a/element.js` only |
| `ja`, `zh`, `he`, `pl` | listed as pairs of interest in `research/recorder/README.md`; no run |
| `scrollIntoView({block:'nearest'})` on an already-visible element | unmeasured. It decides whether a refused merge can be handed back to the engine |
| `translation-resilience` at install points other than `DOMContentLoaded`, and its word-order moves, deletions and conditional removal | untested here |
| Production applications, and language pairs beyond `nl` and `ru` in the timed runs | no run. One fixture page, one Chrome build, at most four updates per strategy |
| Six exports in `research/fingerprints/attempts/` | outside `summary.json`: two Firefox replicates, two Yandex partial runs, and two runs where translation never started (`edge-no-translation.json`, `firefox-no-translation.json`, both `langAfter: "en"`) |

A run in which the engine never translated is not evidence of an engine that does not detach.
`scripts/summarise-fingerprints.mjs` scores `createsTheBug` as `null` whenever `translationDetected`
is false.
