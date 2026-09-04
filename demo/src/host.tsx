import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { createRoot } from 'react-dom/client'
import { initTranslateShield } from 'translate-shield'
import { useTranslationDetected } from 'translate-shield/react'
import type { PanelCommand, PanelMode, PanelState } from './panel'
import './styles.css'

const MODES: ReadonlyArray<PanelMode> = ['unshielded', 'shielded']
const DETACHING_ENGINES: ReadonlyArray<string> = ['google', 'yandex']

const idleState = (mode: PanelMode): PanelState => ({
  type: 'ts-demo/state',
  mode,
  mounted: true,
  crashed: false,
  reactCount: 4,
  onScreen: '',
  wrapperCount: 0,
  patched: false,
})

type Verdict = 'waiting' | 'working' | 'frozen' | 'crashed'

/**
 * One word for what the reader is looking at, instead of six numbers they have
 * to compare themselves. Frozen means React holds a value the screen never got.
 */
const verdictOf = (state: PanelState): Verdict => {
  if (state.crashed || !state.mounted) return 'crashed'
  if (!state.onScreen) return 'waiting'
  return state.onScreen.includes(String(state.reactCount)) ? 'working' : 'frozen'
}

const VERDICT_TEXT: Record<Verdict, string> = {
  waiting: 'waiting',
  working: 'still working',
  frozen: 'frozen, showing an old value',
  crashed: 'crashed, the app is gone',
}

interface StageProps {
  mode: PanelMode
  state: PanelState
  frameRef: (element: HTMLIFrameElement | null) => void
}

const Stage = ({ mode, state, frameRef }: StageProps) => {
  const shielded = mode === 'shielded'
  const verdict = verdictOf(state)

  return (
    <div className={`stage stage--${shielded ? 'good' : 'bad'}`}>
      <h2 className="stage__title" translate="no">
        {shielded ? 'With translate-shield' : 'Without translate-shield'}
      </h2>
      <iframe
        ref={frameRef}
        className="stage__frame"
        src={shielded ? './shielded.html' : './unshielded.html'}
        title={shielded ? 'App with translate-shield installed' : 'App with no protection'}
        loading="eager"
      />
      <div className={`stage__verdict stage__verdict--${verdict}`} translate="no">
        {VERDICT_TEXT[verdict]}
      </div>
      <dl className="stage__facts" translate="no">
        <div>
          <dt>React holds</dt>
          <dd>{state.reactCount}</dd>
        </div>
        <div>
          <dt>Screen shows</dt>
          <dd>{state.onScreen || 'not yet'}</dd>
        </div>
      </dl>
    </div>
  )
}

/**
 * A frame that answers with the host page instead of a panel would render a
 * second copy of this page inside itself and still look like a comparison. That
 * happens whenever the panel URL is wrong, which a static host can turn into a
 * silent fallback rather than a 404, so it is checked rather than assumed.
 */
const useFrameHealth = (
  frames: RefObject<Record<PanelMode, HTMLIFrameElement | null>>,
): boolean => {
  const [healthy, setHealthy] = useState(true)

  useEffect(() => {
    const check = () => {
      const loaded = MODES.map((mode) => {
        const document = frames.current?.[mode]?.contentDocument
        if (!document || document.readyState === 'loading') return true
        return !document.getElementById('page')
      })
      setHealthy(loaded.every(Boolean))
    }
    const timer = window.setInterval(check, 500)
    return () => window.clearInterval(timer)
  }, [frames])

  return healthy
}

const useFrameStates = (): Record<PanelMode, PanelState> => {
  const [states, setStates] = useState<Record<PanelMode, PanelState>>({
    unshielded: idleState('unshielded'),
    shielded: idleState('shielded'),
  })

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data: unknown = event.data
      if (!data || typeof data !== 'object') return
      const message = data as PanelState
      if (message.type !== 'ts-demo/state') return
      setStates((current) => ({ ...current, [message.mode]: message }))
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  return states
}

/**
 * True only while the whole element is on screen. Chrome translates the
 * viewport rather than the page, so a panel that is merely partly visible is
 * not a panel anyone can draw a conclusion from.
 */
const useFullyInView = (ref: RefObject<HTMLElement>): boolean => {
  const [fully, setFully] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const observer = new IntersectionObserver(
      ([entry]) => setFully(Boolean(entry && entry.intersectionRatio >= 0.99)),
      { threshold: [0, 0.99, 1] },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  return fully
}

const App = () => {
  const benchRef = useRef<HTMLDivElement>(null)
  const frames = useRef<Record<PanelMode, HTMLIFrameElement | null>>({
    unshielded: null,
    shielded: null,
  })
  const states = useFrameStates()
  const framesHealthy = useFrameHealth(frames)
  const fullyInView = useFullyInView(benchRef)
  const { isTranslated, engine, lang } = useTranslationDetected()

  const bothTranslated = useMemo(
    () =>
      MODES.every((mode) => {
        const state = states[mode]
        return state.wrapperCount > 0 || state.crashed || !state.mounted
      }),
    [states],
  )
  const anyCrashed = useMemo(
    () => MODES.some((mode) => states[mode].crashed || !states[mode].mounted),
    [states],
  )
  const inPlaceEngine = Boolean(engine) && !DETACHING_ENGINES.includes(engine ?? '')
  const ready = bothTranslated && fullyInView && framesHealthy

  const send = useCallback((command: PanelCommand['command']) => {
    const message: PanelCommand = { type: 'ts-demo/command', command }
    for (const mode of MODES) frames.current[mode]?.contentWindow?.postMessage(message, '*')
  }, [])

  const reload = useCallback(() => {
    for (const mode of MODES) frames.current[mode]?.contentWindow?.location.reload()
  }, [])

  const runSequence = useCallback(() => {
    send('wake')
    let step = 0
    const timer = window.setInterval(() => {
      step += 1
      if (step <= 3) return send('increment')
      if (step === 4) return send('hide-line')
      window.clearInterval(timer)
    }, 900)
  }, [send])

  const disabledReason = !framesHealthy
    ? 'A panel loaded the wrong document'
    : inPlaceEngine
      ? 'This browser is not affected'
      : !isTranslated
        ? 'Turn translation on to enable this'
        : !bothTranslated
          ? 'Waiting for both panels to be translated'
          : 'Scroll so both panels are fully on screen'

  const renderStatus = () => {
    if (!framesHealthy) {
      return (
        <p className="status status--broken" translate="no">
          A panel loaded the wrong document, so there is nothing here to compare. Open this page at
          its own address rather than a sub-path.
        </p>
      )
    }
    if (inPlaceEngine) {
      return (
        <p className="status status--calm" translate="no">
          Your browser rewrites text in place and never hits this bug. Both panels will behave the
          same here, which is the correct result.
        </p>
      )
    }
    if (!isTranslated) {
      return (
        <p className="status" translate="no">
          <strong>Step 1.</strong> Right-click this page, choose Translate, and pick any language.
        </p>
      )
    }
    if (!bothTranslated) {
      return (
        <p className="status" translate="no">
          Translating to {lang}. Waiting for both panels.
        </p>
      )
    }
    if (anyCrashed) {
      return (
        <p className="status status--ready" translate="no">
          That is the bug. The unprotected panel is gone. Press reset to run it again.
        </p>
      )
    }
    if (!fullyInView) {
      return (
        <p className="status" translate="no">
          Scroll so both panels are fully on screen. Chrome only translates what you can see.
        </p>
      )
    }
    return (
      <p className="status status--ready" translate="no">
        <strong>Step 2.</strong> Press the button and watch the left panel.
      </p>
    )
  }

  return (
    <>
      <header className="intro">
        <h1>The same app, twice. One of them is protected.</h1>
        <p>
          When a reader turns on browser translation, React loses track of the text on screen.
          Values stop updating and removing a line crashes the page. The panel on the right calls
          one function. Nothing else about them differs.
        </p>
      </header>

      {renderStatus()}

      <div className="bench" ref={benchRef}>
        <Stage
          mode="unshielded"
          state={states.unshielded}
          frameRef={(element) => {
            frames.current.unshielded = element
          }}
        />
        <Stage
          mode="shielded"
          state={states.shielded}
          frameRef={(element) => {
            frames.current.shielded = element
          }}
        />
      </div>

      <div className="controls" translate="no">
        <button type="button" className="controls__run" onClick={runSequence} disabled={!ready}>
          Update the values
        </button>
        <button type="button" onClick={reload}>
          Reset both panels
        </button>
        {!ready && <span className="controls__hint">{disabledReason}</span>}
      </div>

      <section className="prose">
        <h2>What just happened</h2>
        <p>
          The translator replaced each piece of text with its own wrapper and detached the original
          node. React kept writing to the detached one, so the left panel shows an old value while
          React holds the new one, and hiding a line throws{' '}
          <code translate="no">NotFoundError</code> because the node it wants to remove is no longer
          there. On the right, the shield forwards those writes into the wrapper the reader can
          actually see.
        </p>

        <h2>Does this affect your users</h2>
        <table>
          <thead>
            <tr>
              <th>Browser</th>
              <th>Affected</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Chrome, and the Google website widget</td>
              <td>yes</td>
            </tr>
            <tr>
              <td>Yandex</td>
              <td>crash and frozen values only</td>
            </tr>
            <tr>
              <td>Edge, Firefox</td>
              <td>no, they rewrite text in place</td>
            </tr>
            <tr>
              <td>Safari</td>
              <td>unmeasured</td>
            </tr>
          </tbody>
        </table>

        <h2>Why the panels are separate documents</h2>
        <p>
          Installing the shield patches DOM methods for a whole document, so a shielded panel would
          have quietly protected its neighbour and the comparison would be a lie. Each panel is its
          own document. Chrome translates same-origin frames and detaches inside them, which is what
          makes this honest.
        </p>
      </section>

      <footer className="colophon">
        <pre translate="no">npm install translate-shield</pre>
        <nav>
          <a href="https://www.npmjs.com/package/translate-shield">npm</a>
          <a href="https://github.com/alievdavlat/translate-shield">GitHub</a>
          <a href="https://github.com/alievdavlat/translate-shield/blob/main/research/article.md">
            How it was measured
          </a>
        </nav>
        <p translate="no">MIT, Davlatbek Aliev</p>
      </footer>
    </>
  )
}

initTranslateShield()

const container = document.getElementById('page')

if (container && window.self !== window.top) {
  container.textContent =
    'This page cannot be embedded in itself. A panel document failed to load at its expected address.'
} else if (container) {
  createRoot(container).render(<App />)
}
