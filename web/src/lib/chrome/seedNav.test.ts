import { describe, expect, it } from 'vitest'

import { ensureNavItems, REQUIRED_NAV } from './seedNav'

// Меню в шапке: операция ДОБАВЛЯЕТ недостающее и не трогает написанное
// владельцем. Проверяется чистая часть — слияние списков.
describe('ensureNavItems', () => {
  it('пустое меню — добавляются все стандартные пункты', () => {
    const { nav, added } = ensureNavItems([])
    expect(added).toEqual(REQUIRED_NAV)
    expect(nav.map((i) => i.href)).toEqual(['/news', '/dk', '/prazdniki'])
  })

  it('не дописывает то, что уже есть', () => {
    const { added } = ensureNavItems(REQUIRED_NAV)
    expect(added).toEqual([])
  })

  it('не трогает подпись, если пункт уже есть со своим названием', () => {
    const current = [{ label: 'Афиша', href: '/news' }]
    const { nav, added } = ensureNavItems(current)
    expect(added.map((i) => i.href)).toEqual(['/dk', '/prazdniki'])
    expect(nav[0]).toEqual({ label: 'Афиша', href: '/news' })
  })

  it('хвостовой слэш и регистр не считаются другим пунктом', () => {
    const { added } = ensureNavItems([
      { label: 'Новости', href: '/news/' },
      { label: 'Дома культуры', href: '/DK' },
    ])
    expect(added.map((i) => i.href)).toEqual(['/prazdniki'])
  })

  it('мусор в меню вычищается, а вместо него добавляются стандартные пункты', () => {
    const { nav } = ensureNavItems([{ label: '', href: '/news' }, null, { label: 'Только подпись' }])
    expect(nav).toEqual(REQUIRED_NAV)
  })

  it('не-массив — пустой список, а не падение', () => {
    expect(ensureNavItems(null)).toEqual({ nav: REQUIRED_NAV, added: REQUIRED_NAV })
    expect(ensureNavItems('бывает строкой')).toEqual({ nav: REQUIRED_NAV, added: REQUIRED_NAV })
  })

  it('стандартный список содержит именно тот пункт, о котором просили', () => {
    expect(REQUIRED_NAV).toContainEqual({ label: 'Праздники района', href: '/prazdniki' })
  })
})
