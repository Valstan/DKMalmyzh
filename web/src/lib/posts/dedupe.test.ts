import { describe, expect, it } from 'vitest'

import { DEDUPE_WINDOW_DAYS, dedupeKey, keeperId, normaliseText } from './dedupe'

// Чистая часть чистки дублей: что считать дублем и какую копию оставить.
describe('normaliseText', () => {
  it('регистр и лишние пробелы не мешают', () => {
    expect(normaliseText('  КРОСС   НАЦИИ — 2026! ')).toBe('кросс нации — 2026!')
    expect(normaliseText('Кросс нации')).toBe(normaliseText('кросс  нации'))
  })

  it('неразрывный пробел — обычный, иначе одинаковый текст считался бы разным', () => {
    expect(normaliseText('Клуб\u00a0Малмыж')).toBe('клуб малмыж')
  })

  it('мусор и не-строка дают пустую строку', () => {
    expect(normaliseText(null)).toBe('')
    expect(normaliseText(undefined)).toBe('')
    expect(normaliseText(42)).toBe('')
  })
})

describe('dedupeKey', () => {
  it('одинаковые заголовок и текст — дубль', () => {
    const a = { id: 1, title: 'Кросс нации', text: 'Приглашаем всех' }
    const b = { id: 2, title: 'КРОСС НАЦИИ', text: 'Приглашаем  всех', date: '2026-09-25T05:22:05.000Z' }
    expect(dedupeKey(a)).toBe(dedupeKey(b))
  })

  it('разный текст при одном заголовке — не дубль (обычное дело за один день)', () => {
    const a = { id: 1, title: '27 августа 2026г.', text: 'День российского кино. Тематический сеанс' }
    const b = { id: 2, title: '27 августа 2026г.', text: 'Викторина «Мulkер»' }
    expect(dedupeKey(a)).not.toBe(dedupeKey(b))
  })

  it('без текста судить нельзя — возвращаем null, а не «всё подряд»', () => {
    // Перепосты «запись от 2026-09-21» названы одинаково, но содержания нет:
    // это разные посты ВК, и удалять их нельзя.
    expect(dedupeKey({ id: 1, title: 'РЦКД Малмыж: запись от 2026-09-21', text: '' })).toBeNull()
    expect(dedupeKey({ id: 2, title: '', text: 'что-то' })).toBeNull()
    expect(dedupeKey({ id: 3 })).toBeNull()
  })
})

describe('keeperId', () => {
  const base = { title: 'Кросс', text: 'текст', date: '2026-09-25T05:00:00.000Z' }

  it('оставляет копию с обложкой', () => {
    expect(
      keeperId([
        { ...base, id: 10, hasCover: false },
        { ...base, id: 11, hasCover: true },
      ]),
    ).toBe(11)
  })

  it('при прочих равных — из головного учреждения (районная новость)', () => {
    expect(
      keeperId([
        { ...base, id: 20, hasCover: true, isHeadInstitution: false },
        { ...base, id: 21, hasCover: true, isHeadInstitution: true },
      ]),
    ).toBe(21)
  })

  it('при равном качестве — первую заливку (меньший id)', () => {
    expect(
      keeperId([
        { ...base, id: 30, hasCover: true },
        { ...base, id: 31, hasCover: true },
      ]),
    ).toBe(30)
  })

  it('больше фото важнее, чем порядок заливки', () => {
    expect(
      keeperId([
        { ...base, id: 40, hasCover: true, galleryCount: 1 },
        { ...base, id: 41, hasCover: true, galleryCount: 9 },
      ]),
    ).toBe(41)
  })
})

describe('окно дат', () => {
  it('по умолчанию месяц — перепост через полгода это другая новость', () => {
    expect(DEDUPE_WINDOW_DAYS).toBe(30)
  })
})
