import { useState } from 'react'
import { StaleValues } from './cases/StaleValues'
import { CrashCases } from './cases/CrashCases'
import { ShadowValue } from './cases/ShadowValue'
import { simulateTranslate } from './simulate-translate'

const NEXT_PRICE = '29.99'
const INITIAL_PRICE = '19.99'

export const App = () => {
  const [count, setCount] = useState(4)
  const [price, setPrice] = useState(INITIAL_PRICE)
  const [visible, setVisible] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [wrapped, setWrapped] = useState(0)

  const handleTranslate = () => {
    const root = document.getElementById('cases')
    if (!root) return
    setWrapped(simulateTranslate(root))
  }

  const handleIncrement = () => setCount((current) => current + 1)
  const handleRaisePrice = () => setPrice(NEXT_PRICE)
  const handleToggleVisible = () => setVisible((current) => !current)
  const handleToggleExpanded = () => setExpanded((current) => !current)

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 720 }}>
      <h1>TranslateShield testbed</h1>
      <div id="controls" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button id="btn-translate" type="button" onClick={handleTranslate}>
          Simulate Google Translate
        </button>
        <button id="btn-increment" type="button" onClick={handleIncrement}>
          Increment counter
        </button>
        <button id="btn-price" type="button" onClick={handleRaisePrice}>
          Raise price
        </button>
        <button id="btn-toggle-visible" type="button" onClick={handleToggleVisible}>
          Toggle conditional
        </button>
        <button id="btn-toggle-expanded" type="button" onClick={handleToggleExpanded}>
          Toggle ternary
        </button>
      </div>
      <p id="wrapped-count" style={{ color: '#666' }}>
        wrapped nodes: {wrapped}
      </p>
      <div id="cases">
        <StaleValues count={count} price={price} />
        <CrashCases visible={visible} expanded={expanded} count={count} />
        <ShadowValue count={count} />
      </div>
    </main>
  )
}
