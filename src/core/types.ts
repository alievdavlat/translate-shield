export type TranslatorEngine = 'google' | 'yandex' | 'edge' | 'firefox'

export interface TranslationInfo {
  lang: string
  engine: TranslatorEngine | null
  wrapperTag: string
}

export interface RecoveredError {
  method: 'removeChild' | 'insertBefore'
  redirected: boolean
}

export interface ShieldOptions {
  root?: Element
  wrapperTags?: string[]
  onTranslationDetected?: (info: TranslationInfo) => void
  onRecoveredError?: (error: RecoveredError) => void
  debug?: boolean
}

export interface ShieldHandle {
  stop: () => void
  isTranslated: () => boolean
  engine: () => TranslatorEngine | null
}
