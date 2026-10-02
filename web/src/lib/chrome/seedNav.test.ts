import { describe, expect, it } from 'vitest'

import { mergeNav, REQUIRED_NAV } from './nav'
import { ensureNavItems } from './seedNav'

// Меню в шапке: операция ДОБАВЛЯЕТ недостающее и не трогает написанное
// владельцем. Проверяется чистая часть — слияние списков.
describe('ensureNavItems', () => {
  it('пустое меню — добавляются все стандартные пункты', () => {
    const { nav, added } = ensureNavItems([])
    expect(added).toEqual(REQUIRED_NAV)
    expect(nav.map((i) => i.href)).toEqual(['/news', '/dk', '/prazdniki', '/faq'])
  })

  it('не дописывает то, что уже есть', () => {
    const { added } = ensureNavItems(REQUIRED_NAV)
    expect(added).toEqual([])
  })

  it('не трогает подпись, если пункт уже есть со своим названием', () => {
    const current = [{ label: 'Афиша', href: '/news' }]
    const { nav, added } = ensureNavItems(current)
    expect(added.map((i) => i.href)).toEqual(['/dk', '/prazdniki', '/faq'])
    expect(nav[0]).toEqual({ label: 'Афиша', href: '/news' })
  })

  it('хвостовой слэш и регистр не считаются другим пунктом', () => {
    const { added } = ensureNavItems([
      { label: 'Новости', href: '/news/' },
      { label: 'Дома культуры', href: '/DK' },
    ])
    expect(added.map((i) => i.href)).toEqual(['/prazdniki', '/faq'])
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

// Показ меню отдельным набором проверок, потому что это разные решения: запись
// в базу — служебная операция, показ — отрисовка. Раньше кодовый запасной список
// срабатывал только на ПУСТОЙ шапке, и выкаченная страница могла месяцами лежать
// в меню невидимой. Этот набор фиксирует именно ту ошибку.
describe('mergeNav (что видит посетитель)', () => {
  it('обязательный пункт появляется, даже если в базе его нет', () => {
    // Ровно случай «Вопросов и ответов»: страница есть, в шапке её нет.
    const nav = mergeNav([
      { label: 'Новости', href: '/news' },
      { label: 'Дома культуры', href: '/dk' },
      { label: 'Праздники района', href: '/prazdniki' },
    ])
    expect(nav.map((i) => i.href)).toContain('/faq')
  })

  it('дублей не заводит: ни внутри списка, ни при дописывании', () => {
    const nav = mergeNav([
      ...REQUIRED_NAV,
      { label: 'Новости', href: '/news' },
    ])
    expect(nav.filter((i) => i.href === '/news')).toHaveLength(1)
    expect(nav.filter((i) => i.href === '/faq')).toHaveLength(1)
  })

  it('хвостовой слэш в базе не превращается во вторую кнопку', () => {
    const nav = mergeNav([{ label: 'Вопросы и ответы', href: '/faq/' }])
    expect(nav.filter((i) => i.href.startsWith('/faq'))).toHaveLength(1)
  })

  it('подпись владельца сохраняется — дописывается адрес, а не текст', () => {
    const nav = mergeNav([{ label: 'Часто спрашивают', href: '/faq' }])
    const faq = nav.filter((i) => i.href === '/faq')
    expect(faq).toHaveLength(1)
    expect(faq[0].label).toBe('Часто спрашивают')
  })

  it('пустая шапка даёт полный стандартный список', () => {
    expect(mergeNav(null)).toEqual(REQUIRED_NAV)
    expect(mergeNav([])).toEqual(REQUIRED_NAV)
  })

  it('вход не мутируется', () => {
    const existing = [{ label: 'Афиша', href: '/news' }]
    mergeNav(existing)
    expect(existing).toEqual([{ label: 'Афиша', href: '/news' }])
  })
})
