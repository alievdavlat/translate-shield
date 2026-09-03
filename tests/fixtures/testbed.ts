import type { Page } from '@playwright/test'

export type Protection = 'none' | 'shield' | 'community-guard'

const QUERY_BY_PROTECTION: Record<Protection, string> = {
  none: '/',
  shield: '/?shield=1',
  'community-guard': '/?guard=1',
}

export const openTestbed = async (page: Page, protection: Protection): Promise<void> => {
  await page.goto(QUERY_BY_PROTECTION[protection])
  await page.waitForSelector('#btn-translate')
}

export const translatePage = async (page: Page): Promise<void> => {
  await page.click('#btn-translate')
  await page.waitForFunction(() => document.querySelectorAll('#cases font').length > 0)
}

export const readCase = (page: Page, id: string): Promise<string> =>
  page.locator(`#${id}`).innerText()

export const readEvents = (page: Page): Promise<string[]> =>
  page.evaluate(() => window.__shieldEvents)

export const domErrors = (events: string[]): string[] =>
  events.filter(
    (event) =>
      event.startsWith('error:') &&
      (event.includes('removeChild') || event.includes('insertBefore')),
  )
