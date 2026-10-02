import { describe, expect, it } from 'vitest'

import { lexicalText, makeExcerpt, postDescription } from './excerpt'

const p = (text: string) => ({
  root: {
    type: 'root',
    children: [{ type: 'paragraph', children: [{ type: 'text', text }] }, { type: 'paragraph', children: [{ type: 'text', text: 'второй абзац' }] }],
  },
})

describe('lexicalText', () => {
  it('достаёт текст узлов подряд', () => {
    expect(lexicalText(p('привет'))).toBe('привет\nвторой абзац')
  })
  it('пустое и не-объект дают пустую строку', () => {
    expect(lexicalText(null)).toBe('')
    expect(lexicalText(undefined)).toBe('')
    expect(lexicalText(42)).toBe('')
  })
})

describe('makeExcerpt', () => {
  it('короткий текст проходит целиком, без многоточия', () => {
    expect(makeExcerpt('Приглашаем на концерт')).toBe('Приглашаем на концерт')
  })
  it('переносы и двойные пробелы схлопываются в одну строку', () => {
    expect(makeExcerpt('Первая строка\n\nвторая   строка')).toBe('Первая строка вторая строка')
  })
  it('длинный режется по границе слова с многоточием', () => {
    const out = makeExcerpt('а'.repeat(90) + ' ' + 'б'.repeat(200), 100)
    expect(out.endsWith('…')).toBe(true)
    expect(out).not.toContain('б')
    expect(out.length).toBeLessThanOrEqual(101)
  })
  it('слово длиннее лимита режется, а не пропускается', () => {
    const out = makeExcerpt('о'.repeat(400), 100)
    expect(out.length).toBe(101)
  })
  it('пустое даёт пустую строку', () => {
    expect(makeExcerpt('   \n ')).toBe('')
  })
})

describe('postDescription', () => {
  it('текст записи первичен', () => {
    expect(postDescription({ text: 'Жители наших деревень, сегодня в клубе концерт!', title: 'Афиша от 2026-09-29' })).toBe(
      'Жители наших деревень, сегодня в клубе концерт!',
    )
  })
  it('без текста — имя дома культуры отличает страницу от общей подписи', () => {
    expect(postDescription({ title: 'Афиша от 2026-09-29', institutionTitle: 'РЦКД Малмыж' })).toBe(
      'Афиша от 2026-09-29 — РЦКД Малмыж.',
    )
  })
  it('без текста и без дома остаётся заголовок', () => {
    expect(postDescription({ title: 'Концерт' })).toBe('Концерт')
  })
  it('совсем пусто даёт общую подпись сайта', () => {
    expect(postDescription({})).toContain('Малмыж')
  })
})
