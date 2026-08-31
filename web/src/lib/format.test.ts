import { describe, expect, it } from 'vitest'

import { formatPostDate } from './format'

describe('formatPostDate', () => {
  it('пустое значение даёт пустую строку, а не «Invalid Date» на странице', () => {
    expect(formatPostDate()).toBe('')
    expect(formatPostDate(null)).toBe('')
    expect(formatPostDate('')).toBe('')
  })

  it('нераспознанная дата тоже даёт пустую строку', () => {
    expect(formatPostDate('не дата')).toBe('')
  })

  it('форматирует по-русски: число, месяц прописью, год', () => {
    // Полдень по UTC, а не полночь: с полуночью результат зависел бы от пояса.
    expect(formatPostDate('2026-06-21T12:00:00Z')).toBe('21 июня 2026 г.')
  })
})
