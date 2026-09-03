import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface ShadowValueProps {
  count: number
}

/**
 * A value React owns inside an open shadow root, the way a design system or a
 * web component renders one. Chrome and Yandex both translate through the
 * boundary and detach the node there, so this is the case a shim that observes
 * only `document.body` never sees.
 */
export const ShadowValue = ({ count }: ShadowValueProps) => {
  const hostRef = useRef<HTMLDivElement>(null)
  const [shadow, setShadow] = useState<ShadowRoot | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host || host.shadowRoot) return
    setShadow(host.attachShadow({ mode: 'open' }))
  }, [])

  return (
    <section>
      <h2>Shadow DOM</h2>
      <div id="shadow-host" ref={hostRef}>
        {shadow
          ? createPortal(<p id="shadow-value">There are {count} lights!</p>, shadow)
          : null}
      </div>
    </section>
  )
}
