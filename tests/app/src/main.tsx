import { createRoot } from 'react-dom/client'
import { initTranslateShield } from '../../../src/index'
import { installTranslateCrashGuard } from './community-guard'
import { App } from './App'

declare global {
  interface Window {
    __shieldEvents: string[]
    __shieldHandle?: { stop: () => void }
  }
}

window.__shieldEvents = []
window.addEventListener('error', (event) => {
  window.__shieldEvents.push(`error:${event.message}`)
})

const params = new URLSearchParams(window.location.search)

if (params.has('guard')) installTranslateCrashGuard()

if (params.has('shield')) {
  window.__shieldHandle = initTranslateShield({
    debug: true,
    onTranslationDetected: (info) => window.__shieldEvents.push(`detected:${info.lang}`),
    onRecoveredError: (error) =>
      window.__shieldEvents.push(`recovered:${error.method}:${error.redirected}`),
  })
}

const container = document.getElementById('root')
if (container) createRoot(container).render(<App />)
