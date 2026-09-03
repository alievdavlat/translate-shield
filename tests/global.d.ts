declare global {
  interface Window {
    __installLiveTranslator: (delayMs: number) => void
    __liveTranslatorDelay?: number
    googleTranslateElementInit: () => void
    __probes: Array<{ id: string }>
    __shieldInitError?: string
    __shieldEvents: string[]
    __shieldHandle?: { stop: () => void }
    __competitorError?: string
    Experiments: {
      frameworkWrite: (
        probe: unknown,
        value: string,
      ) => Promise<{ nodeWasConnected?: boolean; visibleAfter?: string }>
    }
    TranslateShield: {
      initTranslateShield: (options?: unknown) => {
        stop: () => void
        conflicts: () => string[]
      }
    }
    __competitor: { installTranslationResilience: () => unknown }
    google: {
      translate: {
        TranslateElement: new (
          options: { pageLanguage: string; autoDisplay: boolean },
          elementId: string,
        ) => unknown
      }
    }
  }
}

export {}
