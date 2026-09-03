export type PatchedSurface =
  | 'Node.prototype.removeChild'
  | 'Node.prototype.insertBefore'
  | 'Node.prototype.replaceChild'
  | 'Node.prototype.nodeValue'
  | 'Node.prototype.textContent'
  | 'CharacterData.prototype.data'
  | 'Element.prototype.attachShadow'

const NATIVE = /\[native code\]/

const isPatched = (candidate: unknown): boolean =>
  typeof candidate === 'function' && !NATIVE.test(Function.prototype.toString.call(candidate))

const setterOf = (target: object, property: string): unknown =>
  Object.getOwnPropertyDescriptor(target, property)?.set

/**
 * Names the DOM surfaces another shim has already replaced.
 *
 * Two shims on one page is not a crash, it is a silent draw. Ours writes the new
 * value into the translator's wrapper; a restore-based shim puts the original
 * node back and deletes that wrapper. Whichever runs second decides, and the
 * loser degrades to doing nothing. Reporting it is the only way a developer
 * finds out, because nothing throws.
 */
export const findConflicts = (): PatchedSurface[] => {
  if (typeof Node === 'undefined') return []

  const surfaces: Array<[PatchedSurface, unknown]> = [
    ['Node.prototype.removeChild', Node.prototype.removeChild],
    ['Node.prototype.insertBefore', Node.prototype.insertBefore],
    ['Node.prototype.replaceChild', Node.prototype.replaceChild],
    ['Node.prototype.nodeValue', setterOf(Node.prototype, 'nodeValue')],
    ['Node.prototype.textContent', setterOf(Node.prototype, 'textContent')],
    ['CharacterData.prototype.data', setterOf(CharacterData.prototype, 'data')],
    ['Element.prototype.attachShadow', Element.prototype.attachShadow],
  ]

  return surfaces.filter(([, value]) => isPatched(value)).map(([name]) => name)
}
