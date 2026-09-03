import { wrapperFor } from './registry'
import type { RecoveredError } from './types'

type RecoveryReporter = (error: RecoveredError) => void

/**
 * Makes removeChild and insertBefore survive nodes a translator detached.
 * Real children take the native path untouched; detached ones are redirected to
 * the visible wrapper instead of throwing NotFoundError.
 */
export const patchDom = (report: RecoveryReporter): (() => void) => {
  const nativeRemoveChild = Node.prototype.removeChild
  const nativeInsertBefore = Node.prototype.insertBefore

  Node.prototype.removeChild = function removeChild<T extends Node>(
    this: Node,
    child: T,
  ): T {
    if (child.parentNode === this) {
      nativeRemoveChild.call(this, child)
      return child
    }

    const wrapper = wrapperFor(child)
    if (wrapper && wrapper.parentNode === this) {
      nativeRemoveChild.call(this, wrapper)
      report({ method: 'removeChild', redirected: true })
      return child
    }

    report({ method: 'removeChild', redirected: false })
    return child
  }

  Node.prototype.insertBefore = function insertBefore<T extends Node>(
    this: Node,
    node: T,
    reference: Node | null,
  ): T {
    if (!reference || reference.parentNode === this) {
      nativeInsertBefore.call(this, node, reference)
      return node
    }

    const wrapper = wrapperFor(reference)
    if (wrapper && wrapper.parentNode === this) {
      nativeInsertBefore.call(this, node, wrapper)
      report({ method: 'insertBefore', redirected: true })
      return node
    }

    nativeInsertBefore.call(this, node, null)
    report({ method: 'insertBefore', redirected: false })
    return node
  }

  return () => {
    Node.prototype.removeChild = nativeRemoveChild
    Node.prototype.insertBefore = nativeInsertBefore
  }
}
