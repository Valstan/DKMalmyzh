import { describe, expect, it } from 'vitest'

import {
  filterInstitutions,
  institutionDisplayName,
  institutionEmoji,
  institutionSearchText,
  isVillageHouse,
  matchesInstitutionQuery,
  stripSettlementPrefix,
  type DirectoryItem,
} from './directory'

// Реальные строки из базы (сняты с прода 02.10) плюс то, чего пока нет:
// школа искусств и музей. Правило «показывать населённый пункт» придумано
// владельцем — и оно легко ломается на будущих учреждениях, если его не
// проверять.

const house = (over: Partial<DirectoryItem> = {}): DirectoryItem => ({
  id: '1',
  slug: 'kalinino',
  title: 'Дом культуры села Калинино',
  shortTitle: 'Калинино',
  settlement: 'с. Калинино',
  ...over,
})

const club = (over: Partial<DirectoryItem> = {}): DirectoryItem => ({
  id: '2',
  slug: 'nosly',
  title: 'Нослинский сельский клуб',
  shortTitle: 'Нослы',
  settlement: 'д. Нослы',
  ...over,
})

describe('isVillageHouse', () => {
  it('дом культуры и сельский клуб — это «дома»', () => {
    expect(isVillageHouse(house())).toBe(true)
    expect(isVillageHouse(club())).toBe(true)
    expect(isVillageHouse(house({ title: 'Старотушкинский сельский Дом культуры' }))).toBe(true)
    expect(isVillageHouse(house({ title: 'Преображенский сельский Дом культуры' }))).toBe(true)
  })

  it('школа искусств, музей и головной центр — не дома', () => {
    expect(isVillageHouse(house({ title: 'Малмыжская детская школа искусств' }))).toBe(false)
    expect(isVillageHouse(house({ title: 'Малмыжский краеведческий музей' }))).toBe(false)
    expect(isVillageHouse(house({ title: 'Малмыжский районный Центр культуры и досуга' }))).toBe(false)
  })

  it('пустое название не считается домом и не ломает правило', () => {
    expect(isVillageHouse(house({ title: '' }))).toBe(false)
    expect(isVillageHouse(house({ title: null }))).toBe(false)
  })
})

describe('stripSettlementPrefix', () => {
  it('убирает префикс населённого пункта', () => {
    expect(stripSettlementPrefix('с. Калинино')).toBe('Калинино')
    expect(stripSettlementPrefix('д. Нослы')).toBe('Нослы')
    expect(stripSettlementPrefix('п. Плотбище')).toBe('Плотбище')
    expect(stripSettlementPrefix('пгт. Что-то')).toBe('Что-то')
  })

  it('название без префикса не трогает', () => {
    expect(stripSettlementPrefix('Калинино')).toBe('Калинино')
    expect(stripSettlementPrefix('  Мари-Малмыж  ')).toBe('Мари-Малмыж')
  })
})

describe('institutionDisplayName', () => {
  it('дом культуры показываем по имени села, без родительного падежа', () => {
    // Главное требование заказчика: вместо «Дом культуры села Калинино» —
    // «Калинино», чтобы искать и сравнивать можно было глазами.
    expect(institutionDisplayName(house())).toBe('Калинино')
    expect(institutionDisplayName(club())).toBe('Нослы')
  })

  it('если короткого названия нет — берём населённый пункт без префикса', () => {
    expect(institutionDisplayName(house({ shortTitle: null }))).toBe('Калинино')
    expect(institutionDisplayName(house({ shortTitle: '', settlement: 'д. Старый Буртек' }))).toBe(
      'Старый Буртек',
    )
  })

  it('учреждение не-дом показываем полным названием — различие и есть смысл', () => {
    expect(
      institutionDisplayName(
        house({ title: 'Малмыжский районный Центр культуры и досуга', shortTitle: 'РЦКД Малмыж' }),
      ),
    ).toBe('РЦКД Малмыж')
    expect(
      institutionDisplayName(
        house({ title: 'Малмыжская детская школа искусств', shortTitle: null }),
      ),
    ).toBe('Малмыжская детская школа искусств')
  })

  it('когда нечего показать — полное название, а не «Без названия»', () => {
    // Молчаливое «Без названия» в списке из 31 карточки неотличимо от поломки.
    const bare = house({ title: '', shortTitle: null, settlement: null })
    expect(institutionDisplayName(bare)).toBe('')
    expect(institutionDisplayName({ id: '3' })).toBe('')
  })
})

describe('institutionEmoji', () => {
  it('школа искусств, музей, библиотека и центр получают свои', () => {
    expect(institutionEmoji(house({ title: 'Малмыжская детская школа искусств' }))).toBe('🎹')
    expect(institutionEmoji(house({ title: 'Малмыжский краеведческий музей' }))).toBe('🏺')
    expect(institutionEmoji(house({ title: 'Районная библиотека' }))).toBe('📚')
    expect(institutionEmoji(house({ title: 'Малмыжский районный Центр культуры и досуга' }))).toBe('🎪')
  })

  it('сельские дома культуры получают театр', () => {
    expect(institutionEmoji(house())).toBe('🎭')
    expect(institutionEmoji(club())).toBe('🎭')
  })

  it('неизвестное учреждение не остаётся без картинки', () => {
    expect(institutionEmoji({ id: '4', title: 'Что-то новое' })).toBe('🎭')
    expect(institutionEmoji({ id: '5' })).toBe('🎭')
  })
})

describe('поиск по учреждениям', () => {
  const list = [
    house(),
    club(),
    house({ id: '6', slug: 'malyy-kityak', title: 'Малокитякский сельский клуб', shortTitle: 'Малый Китяк', settlement: 'д. Малый Китяк' }),
    house({ id: '7', slug: 'bolshoy-kityak', title: 'Большекитякский сельский Дом культуры', shortTitle: 'Большой Китяк', settlement: 'с. Большой Китяк' }),
    house({ id: '8', slug: 'por-kityak', title: 'Поркитякский сельский клуб', shortTitle: 'Пор-Китяк', settlement: 'д. Пор-Китяк' }),
  ]

  it('совпадение в любом месте названия, а не только в начале', () => {
    // Ровно то, о чём просил заказчик: «кит» находит все три Китяка, хотя ни один
    // с него не начинается.
    const found = filterInstitutions(list, 'кит').map((i) => i.shortTitle)
    expect(found).toEqual(['Малый Китяк', 'Большой Китяк', 'Пор-Китяк'])
  })

  it('находит и по полному названию, и по короткому', () => {
    expect(filterInstitutions(list, 'калинино').map((i) => i.shortTitle)).toEqual(['Калинино'])
    expect(filterInstitutions(list, 'Дом культуры села Калинино')).toHaveLength(1)
  })

  it('регистр не важен', () => {
    expect(filterInstitutions(list, 'КИТЯК')).toHaveLength(3)
    expect(filterInstitutions(list, 'Китяк')).toHaveLength(3)
  })

  it('пустой запрос отдаёт весь список, порядок не меняется', () => {
    expect(filterInstitutions(list, '')).toBe(list)
    expect(filterInstitutions(list, '   ')).toBe(list)
  })

  it('порядок результата совпадает с исходным', () => {
    // «сельский» находит и клубы, и ДК — ищется по любому совпадению, а не по
    // типу учреждения. Калинино мимо: там «Дом культуры СЕЛА Калинино».
    expect(filterInstitutions(list, 'сельский').map((i) => i.slug)).toEqual([
      'nosly',
      'malyy-kityak',
      'bolshoy-kityak',
      'por-kityak',
    ])
  })

  it('ничего не найдено — пустой список, а не ошибка', () => {
    expect(filterInstitutions(list, 'zzz')).toEqual([])
    expect(matchesInstitutionQuery(house(), 'zzz')).toBe(false)
  })

  it('строка поиска включает и название, и населённый пункт, и адрес', () => {
    const text = institutionSearchText(house())
    expect(text).toContain('калинино')
    expect(text).toContain('с. калинино')
    expect(text).toContain('kalinino')
  })
})