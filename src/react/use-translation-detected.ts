import { useEffect, useState } from 'react'
import { observeTranslation } from '../core/detect'
import type { TranslatorEngine } from '../core/types'

export interface TranslationState {
  isTranslated: boolean
  engine: TranslatorEngine | null
  lang: string
}

const IDLE: TranslationState = { isTranslated: false, engine: null, lang: '' }

/**
 * Tells a component whether the page is being machine translated, and by which
 * engine. Always reports the idle state on the server and on the first client
 * render, so it cannot cause a hydration mismatch.
 */
export const useTranslationDetected = (): TranslationState => {
  const [state, setState] = useState<TranslationState>(IDLE)

  useEffect(
    () =>
      observeTranslation((info) => {
        setState({ isTranslated: true, engine: info.engine, lang: info.lang })
      }),
    [],
  )

  return state
}
