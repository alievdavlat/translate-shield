import { findConflicts } from './core/conflicts'
import { patchDom } from './core/patch-dom'
import { startObserver } from './core/observer'
import { releaseInterceptors } from './core/registry'
import type {
  RecoveredError,
  ShieldHandle,
  ShieldOptions,
  TranslationInfo,
  TranslatorEngine,
} from './core/types'

export type { RecoveredError, ShieldHandle, ShieldOptions, TranslationInfo, TranslatorEngine }
export type { PatchedSurface } from './core/conflicts'
export { mergeIntoTranslated } from './core/merge-text'

const DEFAULT_WRAPPER_TAGS: ReadonlyArray<string> = []

const inertHandle: ShieldHandle = {
  stop: () => undefined,
  isTranslated: () => false,
  engine: () => null,
  conflicts: () => [],
}

let activeHandle: ShieldHandle | null = null

/**
 * Installs the shield: keeps the DOM operations React relies on from throwing
 * once a translator has rewritten the page, and mirrors framework text updates
 * into the elements the user actually sees.
 */
export const initTranslateShield = (options: ShieldOptions = {}): ShieldHandle => {
  if (typeof document === 'undefined') return inertHandle
  if (activeHandle) return activeHandle

  const {
    root = document.body || document.documentElement,
    wrapperTags = DEFAULT_WRAPPER_TAGS,
    debug = false,
  } = options
  if (!root) return inertHandle

  let translated = false
  let engine: TranslatorEngine | null = null

  const conflicts = findConflicts()
  if (conflicts.length > 0) {
    options.onConflict?.(conflicts)
    console.warn(
      '[translate-shield] another shim already replaced ' +
        conflicts.join(', ') +
        '. Both will run, but only one repair strategy can win and the other silently does nothing. Install one.',
    )
  }

  const report = (error: RecoveredError): void => {
    options.onRecoveredError?.(error)
    if (!debug) return
    console.warn('[translate-shield] recovered', error.method, {
      redirected: error.redirected,
    })
  }

  const handleTranslationDetected = (info: TranslationInfo): void => {
    translated = true
    engine = info.engine
    options.onTranslationDetected?.(info)
    if (!debug) return
    console.warn('[translate-shield] translation detected', info)
  }

  const restoreDom = patchDom(report)
  const stopObserver = startObserver({
    root,
    wrapperTags,
    onTranslationDetected: handleTranslationDetected,
  })

  activeHandle = {
    stop: () => {
      stopObserver()
      restoreDom()
      releaseInterceptors()
      activeHandle = null
    },
    isTranslated: () => translated,
    engine: () => engine,
    conflicts: () => conflicts,
  }

  return activeHandle
}
