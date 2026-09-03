# Recording a fingerprint

One run produces one JSON file in `research/fingerprints/`, and is finished when `npm run
summarise` shows a row for it. To undo it, move the file into `attempts/`:
the summariser reads only `*.json` sitting directly in `research/fingerprints/`
(`scripts/summarise-fingerprints.mjs`). What the numbers mean: `../measurements.md`.

| Requirement | Check |
|---|---|
| Node 18 or newer (`engines` in `package.json`) | `node --version` |
| Dependencies installed | `npm ls vite` prints a version rather than an error |
| Port 5200 free | `npm run recorder` starts; otherwise see "when it goes wrong" |
| The browser under test can translate | its translate menu offers your target language |

## The run

Terminal, repository root. Leave it open: the page needs the dev server to be served and
to save its output.

```bash
npm run recorder
# vite --port 5200 --strictPort research/recorder
```

In the browser under test:

1. Open the recorder with your engine label and target.

   ```
   http://localhost:5200/?autoarm=1&engine=<engine-label>&target=<language>&patience=20000
   ```

   Wait for `Armed. Now turn on your browser translation, then press Capture.`

2. Translate the page: its prompt, the address-bar icon, or right click and Translate.

3. Press `Capture fingerprint`. Read the classification.

4. Press `Save into repo`, before the experiments.

5. Press `Run experiments`. Wait for `Experiments done. Export the JSON.`

6. Press `Save into repo` again, overwriting step 4 with the complete run.

7. Terminal: rename the file, add a `provenance.json` row, run `npm run summarise`.

| Step | What it costs you to get wrong |
|---|---|
| 1 | Arming snapshots every original TextNode. A node the translator already replaced cannot be told apart from one that never existed, so arm before anything is translated. Without `autoarm=1`, press `Arm` yourself |
| 3 | Compare `DETACHING ENGINE` or `IN-PLACE ENGINE` against that engine's row in `../measurements.md`. A disagreement is the finding: write it in the Notes box, save the run, and do not overwrite the existing file. Capture is repeatable and costs nothing |
| 3 | The control panel carries `translate="no"` and `class="notranslate"`. Every measured engine honours `translate="no"`; Yandex translated the `class="notranslate"` probe. A panel that gets translated anyway belongs in the Notes box, saved into the report as `notes` |
| 4 | Both save buttons work from Capture onwards, and the fingerprint half of a run is worth keeping on its own. A manual run is the kind that gets interrupted |
| 5 | Keep the tab in front and visible, and do not touch the page. Chrome translates only what is in the viewport, so a backgrounded or scrolled-away tab changes the result rather than merely slowing it (`../provocation.json`, `../visibility-confound.json`) |
| 5 | Wait for the status line, not for a clock. An engine that never reacts caps the pass at roughly seven times `patience` plus seven seconds (`js/experiments.js`): about two and a half minutes at `patience=20000`, about one minute at the default 6000. Much longer is a stall |
| 7 | The browser often picks a language of its own. Take the name from `fingerprint.langAfter`, never from the URL |

## Engines only a person can switch on

| Browser | Why | Run on record |
|---|---|---|
| Edge | it did not auto-translate from a seeded profile; a person has to accept its prompt | `../fingerprints/edge-builtin-nl.json` |
| Firefox | Playwright's Firefox build carries no translation feature. It downloads a language model the first time it translates a given pair, so if Capture reports nothing, give it a moment and press Capture again | `../fingerprints/firefox-builtin-fr.json` |
| Yandex Browser | no automation hook for its translator; a person has to accept the prompt | `../fingerprints/yandex-builtin-de.json` |
| Safari | needs a Mac and cannot be done on this machine. Playwright's WebKit build is not Safari and carries no translator | none. Never run |

Safari stays marked not measured in `../measurements.md`. An empty cell is honest and a guess
is not; reaching it needs a Mac, or a rented cloud Mac, and the recorder on a URL it can reach.

## URL parameters

Read on load (`js/app.js`).

| Parameter | Effect |
|---|---|
| `autoarm=1` | presses `Arm` for you, before any translation can happen |
| `engine` | fills the Engine field. A label only; recorded as `meta.engineLabel`, and what `npm run summarise` groups rows by |
| `target` | fills the Target language field. A label only: it does not steer the browser, and two of the three manual runs on record ignored it, `nl` coming back French in Firefox and German in Yandex. To reach a plural-sensitive target such as `ru`, set the language in the browser's own translate UI before step 2. Nothing in the recorder can do it for you |
| `patience` | milliseconds each experiment waits for the engine to react before giving up or provoking it. Default 6000 (`js/experiments.js`) |

## Export buttons

All three work from Capture onwards.

| Button | What it does |
|---|---|
| `Save into repo` | posts the report to the dev server, which writes it straight into `research/fingerprints/` (`vite.config.mjs`). Use this whenever the page is on `localhost:5200` |
| `Download JSON` | fallback for a page not served by `npm run recorder`. Goes to the browser download folder, which is where the first attempt at these runs was lost |
| `Copy JSON` | puts the report on the clipboard and in a text box on the page, for a machine that cannot write to this repository |

## Status lines

From `js/app.js`; the tone colour matches.

| Status line | Meaning | What to do |
|---|---|---|
| `Press Arm before translating anything.` | loaded and idle | arm it, or reload with `autoarm=1` |
| `Armed. Now turn on your browser translation, then press Capture.` | originals are snapshotted | translate the page |
| `No translation detected yet. Translate the page, then press Capture again.` | no probe text node was detached and none was mutated in place | translate, scroll the probes into view, press Capture again |
| `IN-PLACE ENGINE: text nodes were mutated, not detached.` | the engine rewrote the live text nodes | valid result. Run the experiments |
| `DETACHING ENGINE: <n> original text nodes were detached.` | the engine replaced text nodes with a wrapper | valid result. Run the experiments |
| `Running experiment <i>/5: <name>` | pass in progress, `1/5: frameworkWrite` through `5/5: burstOneHz` | keep the tab in front, do not touch the page |
| `Experiments done. Export the JSON.` | all five finished | save |
| `Saved to research/fingerprints/<file>` | the dev server wrote the file | rename it |
| `Could not save into the repo (<reason>). Use Download JSON instead.` | the POST to `/save-fingerprint` failed | see "when it goes wrong" |
| `JSON is in the box below and on your clipboard.` | Copy JSON succeeded | paste it into a file |
| `<n> mutations recorded`, plus `foreign activity detected` | counter under the status line; the second half appears once a mutation is attributed to the translator rather than to the recorder | stuck low with no foreign activity after you translated means the translator has not reached the probes |

## Naming and provenance

| Step | Rule |
|---|---|
| Saved name | `fingerprint-<engine>-<target>.json`, from the two form fields, lowercased, anything outside `a-z0-9-` replaced by a hyphen (`fileName()` in `js/app.js`) |
| Rename to | `<engine>-<actual target>.json`: drop the `fingerprint-` prefix and take the language from `fingerprint.langAfter`. That is why `firefox-builtin-fr.json` and `yandex-builtin-de.json` are named as they are; both were requested as `nl` |
| Engine label | reuse one already in the corpus so summariser rows group. From `research/fingerprints/summary.json`: `chrome-builtin`, `edge-builtin`, `firefox-builtin`, `yandex-builtin`, `google-element`, `google-element-firefox`, `google-element-webkit`, `simulated-gt` |
| Provenance row | add by hand to `research/provenance.json`: `recordedAt` from `meta.recordedAtIso`, `platform` from `meta.platform`, browser name and version from `meta.userAgent` |

## A real run, or a failed one

Three of these five shapes have happened; their files are in `attempts/`.

| Signature in the JSON | Verdict |
|---|---|
| `fingerprint.langChanged: false`, `markersFound: []`, every probe `changed: false` | translation never ran. Not a measurement of anything; move it into `attempts/`. `attempts/edge-no-translation.json`, `attempts/firefox-no-translation.json` |
| the prompt was accepted but Capture still reports no translation | same verdict, and the common manual-run failure. Move it into `attempts/` and repeat |
| `experiments: {}` | saved after Capture, before the experiments finished. The fingerprint half is usable; move it into `attempts/` and repeat the run rather than reporting the row closed. `attempts/yandex-partial.json` |
| `mutationsDropped` greater than 0 | the 4000 entry cap in `js/recorder.js` was hit and `mutations[]` is truncated. Fingerprint and experiments still stand; only the raw timeline is incomplete. No kept run has hit this: the largest is 3761 entries in `google-element-nl.json` |
| `wrapperWrite` and `untranslatedWindow` reporting `applicable: false` with reason `this engine injected no wrapper element anywhere` | not a failure. Those two experiments need a wrapper element, and an in-place engine creates none. `edge-builtin-nl.json` and `firefox-builtin-fr.json` are complete runs that look like this |

`npm run summarise` scores a run with no detected translation as `createsTheBug: null`, never
`false`, so a failed attempt cannot be misread as a safe engine. A superseded but valid
replicate belongs in `attempts/` too.

## When it goes wrong

| Symptom | Cause | Fix |
|---|---|---|
| `Error: Port 5200 is already in use` | `--strictPort` is deliberate: every URL, every Playwright spec and the save endpoint are pinned to 5200, so the server refuses to move to 5201 rather than splitting the run across two ports | an earlier recorder is probably still running; reuse that tab. Otherwise free the port, below |
| `Could not save into the repo`, reason is a network or fetch error | the page is not being served by `npm run recorder`. `/save-fingerprint` exists only in that dev server (`vite.config.mjs`) | press `Download JSON` or `Copy JSON`, then put the file in `research/fingerprints/` yourself |
| `Could not save into the repo (report too large)` | the report exceeded the 40 MB body limit in `vite.config.mjs`. The largest kept run is 1.46 MB (`google-element-ru.json`), so this points at a runaway mutation stream | as above, and check `mutationsDropped` |
| `No translation detected yet.` with the page visibly translated | the translator has not reached the probes. Chrome translates what is in the viewport and nothing else (`../provocation.json`) | scroll the Probes section into view, wait a second, press Capture again. If the page is not visibly translated at all, retry step 2 |
| `translatedAfterMs: null` or `neededProvocation: true` everywhere, on an engine that reacted quickly during Capture | the tab was in the background during the experiments. A hidden tab is a different measurement | discard into `attempts/` and repeat with the tab in front. Of eleven signals tested from a proven-idle state, only `element.scrollIntoView()` woke Chrome, at 158ms (`../provocation.json`), which is what the provocation step itself uses |

```powershell
# Windows, free port 5200
Get-NetTCPConnection -LocalPort 5200 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

## Handing the run to someone else

Plain HTML, classic scripts, no build step: it opens straight from disk as
`research/recorder/index.html`.

| Off `localhost:5200` | Consequence |
|---|---|
| `Save into repo` | cannot work. The helper presses `Download JSON` or `Copy JSON` and sends the file back |
| A `file://` page | browsers are less willing to offer translation than on `http://`, so a hosted copy is the reliable route for a remote helper |

## Targets worth recording

At least two per engine: one where the number does not change the sentence, one where it does.

| Target | Why it is on the list | In the corpus |
|---|---|---|
| `nl`, `de` | number-invariant sentences, the case numeric merge is easiest on | yes |
| `ru`, `pl` | CLDR plural categories change the noun and the verb at 1, 2 to 4, and 5 and up | `ru` yes, `pl` no |
| `ar` | six plural categories, plus Arabic-Indic digits | yes |
| `fr` | number-invariant, reached by accident when Firefox chose its own target | yes |
| `ja`, `zh` | counters, no plural, different digit handling | no |
| `he` | right to left, bidi control characters | no. `ar` covers right to left so far |

Targets marked no have never been recorded; nothing is known about them.

## Verify the run landed

`npm run summarise` rewrites `research/fingerprints/summary.json` from every file in the
directory, so repeat it freely. The new row:

| Field in that row | Expected |
|---|---|
| `engine`, `actualTarget` | filled |
| `createsTheBug` | `true` or `false`. A `null` means the summariser detected no translation, whatever the browser appeared to do |
| `wrapperTag` | matches what you saw on screen |

## The automated route

Playwright drives the same recorder page into the same directory, starting the recorder if it
is not running (`playwright.config.ts`, `reuseExistingServer`):

```bash
npx playwright test
```

| Spec | What it covers |
|---|---|
| `tests/specs/real-google.spec.ts` | Google's `translate_a/element.js` bundle across targets |
| `tests/specs/recorder.spec.ts`, `tests/specs/save-into-repo.spec.ts` | the recorder page and its save endpoint still work |
