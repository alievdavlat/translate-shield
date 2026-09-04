import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

export type PanelMode = 'unshielded' | 'shielded'

export interface PanelCommand {
  type: 'ts-demo/command'
  command: 'increment' | 'hide-line' | 'wake'
}

export interface PanelState {
  type: 'ts-demo/state'
  mode: PanelMode
  mounted: boolean
  crashed: boolean
  reactCount: number
  onScreen: string
  wrapperCount: number
  patched: boolean
}

const PRICES = ['19.99', '24.50', '31.00', '48.75']

const isPatched = (fn: unknown): boolean => !/\[native code\]/.test(String(fn))

const snapshot = (mode: PanelMode, crashed: boolean, reactCount: number): PanelState => ({
  type: 'ts-demo/state',
  mode,
  mounted: (document.getElementById('root')?.childElementCount ?? 0) > 0,
  crashed,
  reactCount,
  onScreen: document.getElementById('lights')?.textContent ?? '',
  wrapperCount: document.querySelectorAll('font, ya-tr-span').length,
  patched: isPatched(Node.prototype.removeChild),
})

interface SpecimenProps {
  mode: PanelMode
}

/**
 * The material under test. Both documents render this identically, so anything
 * that differs on screen comes from the shield rather than from the markup.
 *
 * Two shapes here are load-bearing. The literal text either side of {count}
 * forces React to emit separate text nodes, which is what lets a translated
 * value freeze. The <span> after the conditional string is the required sibling
 * that turns hiding a line into removeChild rather than a textContent clear.
 */
const Specimen = ({ mode }: SpecimenProps) => {
  const [count, setCount] = useState(4)
  const [priceIndex, setPriceIndex] = useState(0)
  const [visible, setVisible] = useState(true)
  const crashedRef = useRef(false)

  const handleCommand = useCallback((command: PanelCommand['command']) => {
    if (command === 'increment') {
      setCount((value) => value + 1)
      setPriceIndex((value) => (value + 1) % PRICES.length)
      return
    }
    if (command === 'hide-line') return setVisible(false)
    document.getElementById('lights')?.scrollIntoView({ block: 'center' })
  }, [])

  useEffect(() => {
    const onError = () => {
      crashedRef.current = true
    }
    const onMessage = (event: MessageEvent) => {
      const data: unknown = event.data
      if (!data || typeof data !== 'object') return
      const message = data as PanelCommand
      if (message.type === 'ts-demo/command') handleCommand(message.command)
    }
    window.addEventListener('error', onError)
    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('message', onMessage)
    }
  }, [handleCommand])

  useEffect(() => {
    const report = () => window.parent.postMessage(snapshot(mode, crashedRef.current, count), '*')
    report()
    const timer = window.setInterval(report, 250)
    return () => window.clearInterval(timer)
  }, [mode, count])

  return (
    <div className="specimen">
      <p id="lights">There are {count} lights!</p>
      <p id="total">Total: {PRICES[priceIndex]} EUR per order</p>
      <p id="conditional">
        {visible && 'Delivery is on the way'}
        <span id="conditional-tail"> and the driver has left</span>
      </p>
      <p id="protected">
        Order <span translate="no" className="notranslate">PIN-4417-02</span> confirmed
      </p>
    </div>
  )
}

export const renderPanel = (mode: PanelMode): void => {
  const container = document.getElementById('root')
  if (!container) return

  window.addEventListener('error', () => {
    window.parent.postMessage({ ...snapshot(mode, true, 0), mounted: false }, '*')
  })

  createRoot(container).render(<Specimen mode={mode} />)
}
