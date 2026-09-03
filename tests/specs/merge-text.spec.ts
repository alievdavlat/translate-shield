import { expect, test } from '@playwright/test'
import { mergeIntoTranslated } from '../../src/core/merge-text'

test.describe('numeric merge, checked against strings real Google Translate produced', () => {
  test('updates a Dutch sentence and keeps it Dutch', () => {
    expect(
      mergeIntoTranslated('There are 4 lights!', 'There are 7 lights!', 'Er zijn 4 lampen!', 'nl'),
    ).toBe('Er zijn 7 lampen!')
  })

  test('keeps the locale decimal separator the translator chose', () => {
    expect(
      mergeIntoTranslated(
        'Total: 19.99 EUR per order',
        'Total: 29.99 EUR per order',
        'Totaal: 19,99 EUR per bestelling',
        'nl',
      ),
    ).toBe('Totaal: 29,99 EUR per bestelling')
  })

  test('refuses when the Russian plural category changes (few to many)', () => {
    expect(
      mergeIntoTranslated('There are 4 lights!', 'There are 7 lights!', 'Здесь 4 лампочки!', 'ru'),
    ).toBe('There are 7 lights!')
  })

  test('allows a Russian update inside the same plural category', () => {
    expect(
      mergeIntoTranslated('There are 5 lights!', 'There are 7 lights!', 'Здесь 5 лампочек!', 'ru'),
    ).toBe('Здесь 7 лампочек!')
  })

  test('writes Arabic-Indic digits back in the same digit system', () => {
    expect(
      mergeIntoTranslated('There are 4 lights!', 'There are 5 lights!', 'يوجد ٤ أضواء!', 'ar'),
    ).toBe('يوجد ٥ أضواء!')
  })

  test('refuses when the target locale is unknown', () => {
    expect(
      mergeIntoTranslated('There are 4 lights!', 'There are 7 lights!', 'Er zijn 4 lampen!', ''),
    ).toBe('There are 7 lights!')
  })

  test('refuses when the sentence itself changed', () => {
    expect(
      mergeIntoTranslated('There are 4 lights!', 'No lights at all!', 'Er zijn 4 lampen!', 'nl'),
    ).toBe('No lights at all!')
  })

  test('refuses when the digit count changes', () => {
    expect(
      mergeIntoTranslated('There are 9 lights!', 'There are 10 lights!', 'Er zijn 9 lampen!', 'nl'),
    ).toBe('There are 10 lights!')
  })

  test('returns the translation untouched when nothing changed', () => {
    expect(
      mergeIntoTranslated('There are 4 lights!', 'There are 4 lights!', 'Er zijn 4 lampen!', 'nl'),
    ).toBe('Er zijn 4 lampen!')
  })
})
