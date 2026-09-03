const NUMBER_PATTERN = /\d+(?:[.,\s]\d+)*/g
const TRANSLATED_NUMBER_PATTERN = /\p{Nd}+(?:[.,\s]\p{Nd}+)*/gu

const DIGIT_ZEROS = [
  0x0030, 0x0660, 0x06f0, 0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66,
  0x0e50, 0x0ed0, 0x0f20, 0x1040, 0x17e0, 0x1810, 0xff10,
]

const numbersOf = (value: string): string[] => value.match(NUMBER_PATTERN) ?? []

const skeletonOf = (value: string): string => value.replace(NUMBER_PATTERN, '')

const digitsOf = (value: string): string => value.replace(/\D/g, '')

const zeroCodePointFor = (codePoint: number): number | null => {
  for (const zero of DIGIT_ZEROS) {
    if (codePoint >= zero && codePoint <= zero + 9) return zero
  }
  return null
}

const asNumber = (value: string): number | null => {
  const digits = digitsOf(value)
  if (!digits) return null
  const fraction = value.match(/[.,](\d{1,2})$/)?.[1]
  if (!fraction) return Number(digits)
  const whole = digits.slice(0, digits.length - fraction.length)
  return Number(`${whole || '0'}.${fraction}`)
}

/**
 * True when swapping one value for another cannot change the grammatical number
 * of the sentence. Russian "4 lampochki" (few) and "7 lampochek" (many) take
 * different noun forms, so a digit swap there produces fluent-looking wrong text.
 */
const ruleCache = new Map<string, Intl.PluralRules | null>()

const pluralRulesFor = (locale: string): Intl.PluralRules | null => {
  const cached = ruleCache.get(locale)
  if (cached !== undefined) return cached

  let rules: Intl.PluralRules | null = null
  try {
    rules = new Intl.PluralRules(locale)
  } catch {
    rules = null
  }
  ruleCache.set(locale, rules)
  return rules
}

const keepsPluralCategory = (previous: string[], next: string[], locale: string): boolean => {
  if (!locale) return false

  const rules = pluralRulesFor(locale)
  if (!rules) return false

  return previous.every((value, index) => {
    const before = asNumber(value)
    const after = asNumber(next[index] ?? '')
    if (before === null || after === null) return false
    return rules.select(before) === rules.select(after)
  })
}

/**
 * Writes new digits into a number the translator already formatted, keeping that
 * number's own separators and digit system, so "19,99" updated from "29.99"
 * becomes "29,99" rather than "29.99".
 */
const reskinNumber = (translatedNumber: string, sourceDigits: string): string | null => {
  const characters = Array.from(translatedNumber)
  const digitCount = characters.filter(
    (character) => zeroCodePointFor(character.codePointAt(0) ?? 0) !== null,
  ).length
  if (digitCount !== sourceDigits.length) return null

  let index = 0
  return characters
    .map((character) => {
      const zero = zeroCodePointFor(character.codePointAt(0) ?? 0)
      if (zero === null) return character
      const digit = Number(sourceDigits[index] ?? '0')
      index += 1
      return String.fromCodePoint(zero + digit)
    })
    .join('')
}

/**
 * Merges a new source value into an already translated string. The merge only
 * happens when it cannot change meaning: the sentence around the numbers is
 * identical, every number keeps its plural category in the target language, and
 * the digits line up one for one. Otherwise the correct value is returned in the
 * source language, because a visibly untranslated number beats a fluent-looking
 * wrong one.
 */
export const mergeIntoTranslated = (
  previousSource: string,
  nextSource: string,
  translated: string,
  locale: string,
): string => {
  if (!translated) return nextSource
  if (previousSource === nextSource) return translated
  if (skeletonOf(previousSource) !== skeletonOf(nextSource)) return nextSource

  const previousNumbers = numbersOf(previousSource)
  const nextNumbers = numbersOf(nextSource)
  if (previousNumbers.length !== nextNumbers.length) return nextSource
  if (!keepsPluralCategory(previousNumbers, nextNumbers, locale)) return nextSource

  const translatedNumbers = translated.match(TRANSLATED_NUMBER_PATTERN) ?? []
  if (translatedNumbers.length !== nextNumbers.length) return nextSource

  const replacements = translatedNumbers.map((translatedNumber, index) =>
    reskinNumber(translatedNumber, digitsOf(nextNumbers[index] ?? '')),
  )
  if (replacements.includes(null)) return nextSource

  let cursor = 0
  return translated.replace(TRANSLATED_NUMBER_PATTERN, (match) => {
    const replacement = replacements[cursor]
    cursor += 1
    return replacement ?? match
  })
}
