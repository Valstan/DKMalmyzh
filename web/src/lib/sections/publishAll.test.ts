import { describe, expect, it } from 'vitest'

import {
  lexicalText,
  matchInstitutionByText,
  parseVkOwner,
  resolvePublishDate,
} from './publishAll'

// Чистая логика массовой публикации: владелец стены, дата оригинала,
// упоминание дома в тексте. БД и HTTP — в selftest гейта.
describe('parseVkOwner', () => {
  it('канонический owner_post разбирается', () => {
    expect(parseVkOwner('-218991929_12')).toBe(-218991929)
    expect(parseVkOwner('234960216_7')).toBe(234960216)
  })

  it('мусор — null, а не чужой дом', () => {
    expect(parseVkOwner(null)).toBeNull()
    expect(parseVkOwner('')).toBeNull()
    expect(parseVkOwner('abc')).toBeNull()
    expect(parseVkOwner('-123')).toBeNull()
  })
})

describe('resolvePublishDate', () => {
  it('валидная дата оригинала — как есть', () => {
    expect(resolvePublishDate('2026-08-20T10:00:00.000Z', '2026-09-01T00:00:00.000Z')).toEqual({
      iso: '2026-08-20T10:00:00.000Z',
      usedFallback: false,
    })
  })

  it('мусор вместо даты — fallback с пометкой', () => {
    expect(resolvePublishDate('когда-то', '2026-09-01T00:00:00.000Z')).toEqual({
      iso: '2026-09-01T00:00:00.000Z',
      usedFallback: true,
    })
  })

  it('нет ни даты, ни fallback — null (запись пропускаем, не выдумываем)', () => {
    expect(resolvePublishDate(null, null)).toEqual({ iso: null, usedFallback: true })
  })
})

const candidates = [
  { id: 1, shortTitle: 'Рожки', settlement: 'с. Рожки' },
  { id: 2, shortTitle: 'Гоньба', settlement: 'с. Гоньба' },
  { id: 3, shortTitle: 'Тат-Верх-Гоньба', settlement: 'с. Тат-Верх-Гоньба' },
]

describe('matchInstitutionByText', () => {
  it('единственное упоминание — пристраиваем', () => {
    expect(matchInstitutionByText('Концерт в Рожках', '', candidates)).toBe(1)
    expect(matchInstitutionByText('', 'собрались в селе Гоньба', candidates)).toBe(2)
  })

  it('два дома в тексте — неоднозначность, не пристраиваем', () => {
    expect(matchInstitutionByText('Гоньба и Тат-Верх-Гоньба', '', candidates)).toBeNull()
  })

  it('полное совпадение сильнее префикса соседней карточки', () => {
    const houses = [
      { id: 1, shortTitle: 'Самотест-В' },
      { id: 2, shortTitle: 'Самотестово-Т' },
    ]
    expect(matchInstitutionByText('Праздник в Самотестово-Т удался', '', houses)).toBe(2)
  })

  it('ничего не упомянуто — null', () => {
    expect(matchInstitutionByText('Областной семинар', 'приезжали гости', candidates)).toBeNull()
    expect(matchInstitutionByText('', '', candidates)).toBeNull()
  })
})

describe('lexicalText', () => {
  it('собирает текстовые узлы', () => {
    const doc = {
      root: {
        children: [
          { type: 'paragraph', children: [{ type: 'text', text: 'Привет' }] },
          { type: 'paragraph', children: [{ type: 'text', text: 'мир' }] },
        ],
      },
    }
    expect(lexicalText(doc)).toContain('Привет')
    expect(lexicalText(doc)).toContain('мир')
  })

  it('мусор — пустая строка', () => {
    expect(lexicalText(null)).toBe('')
  })
})
