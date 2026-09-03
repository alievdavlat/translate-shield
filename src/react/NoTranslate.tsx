import type { ReactNode } from 'react'

type NoTranslateTag = 'span' | 'div' | 'p' | 'td' | 'strong' | 'output' | 'bdi'

export interface NoTranslateProps {
  children: ReactNode
  as?: NoTranslateTag
  className?: string
}

/**
 * Marks a value the browser translator must leave alone.
 *
 * Prices, counters, order numbers and codes do not need translating, and every
 * engine measured — Chrome, Edge, Firefox, Yandex and the Google bundle —
 * honours both `translate="no"` and `.notranslate`. Because the translator never
 * touches the node, the framework can keep updating it: no crash, no frozen
 * value, and no risk of a merged number breaking the grammar of a sentence.
 *
 * Wrap the value, never the whole sentence, or the reader loses the translation.
 */
export const NoTranslate = ({ children, as: Tag = 'span', className }: NoTranslateProps) => (
  <Tag translate="no" className={className ? `notranslate ${className}` : 'notranslate'}>
    {children}
  </Tag>
)
