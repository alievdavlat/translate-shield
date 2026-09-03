import { expect, test, type Page } from '@playwright/test'
import { openTestbed, translatePage } from '../fixtures/testbed'

interface Attempt {
  threw: string | null
  visible: string
}

/**
 * `replaceChild` fails the same way `removeChild` does: the reference child must
 * be a child, and after translation it is not. React reaches for it when a text
 * child is swapped for an element, so it is the third call worth guarding.
 */
const replaceDetachedNode = (page: Page): Promise<Attempt> =>
  page.evaluate(() => {
    const host = document.getElementById('lights')
    const wrapper = host?.querySelector('font')
    if (!host || !wrapper) return { threw: 'probe not translated', visible: '' }

    const detached = document.createTextNode('There are 4 lights!')
    const replacement = document.createElement('span')
    replacement.textContent = 'replaced'

    let threw: string | null = null
    try {
      host.replaceChild(replacement, detached)
    } catch (error) {
      threw = String((error as Error).name)
    }
    return { threw, visible: host.textContent ?? '' }
  })

test.describe('replaceChild against a node the translator detached', () => {
  test('unprotected it throws NotFoundError', async ({ page }) => {
    await openTestbed(page, 'none')
    await translatePage(page)
    const { threw } = await replaceDetachedNode(page)
    expect(threw).toBe('NotFoundError')
  })

  test('with the shield it does not throw', async ({ page }) => {
    await openTestbed(page, 'shield')
    await translatePage(page)
    const { threw } = await replaceDetachedNode(page)
    expect(threw).toBeNull()
  })
})
