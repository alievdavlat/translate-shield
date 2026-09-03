interface GuardedWindow extends Window {
  __translateCrashGuardInstalled?: boolean
}

/**
 * The community guard published at
 * https://dev.to/nirazanbasnet/why-google-translate-crashes-your-react-app-and-how-to-fix-it-391
 * Reproduced here unchanged so it can be measured against the shield on the
 * exact same failure cases. Not our code, not shipped in any package.
 */
export const installTranslateCrashGuard = (): void => {
  const guarded: GuardedWindow = window
  if (guarded.__translateCrashGuardInstalled) return
  guarded.__translateCrashGuardInstalled = true

  const originalRemoveChild = Node.prototype.removeChild
  Node.prototype.removeChild = function removeChild<T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) {
      if (child.parentNode) child.parentNode.removeChild(child)
      return child
    }
    originalRemoveChild.call(this, child)
    return child
  }

  const originalInsertBefore = Node.prototype.insertBefore
  const patchedInsertBefore = function insertBefore<T extends Node>(
    this: Node,
    newNode: T,
    referenceNode: Node | null,
  ): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      originalInsertBefore.call(this, newNode, null)
      return newNode
    }
    originalInsertBefore.call(this, newNode, referenceNode)
    return newNode
  }
  Node.prototype.insertBefore = patchedInsertBefore
}
