import { describe, expect, it } from 'vitest'

import {
  filterInstitutions,
  filterRows,
  institutionDisplayName,
  institutionEmoji,
  institutionSearchText,
  isVillageHouse,
  matchesInstitutionQuery,
  matchesRow,
  stripSettlementPrefix,
  toDirectoryRows,
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
    // Короткое имя «РЦКД Малмыж» в базе есть, но показываем полное: сокращение
    // понятно только местным, а список читают и гости, и роботы.
    expect(
      institutionDisplayName(
        house({ title: 'Малмыжский районный Центр культуры и досуга', shortTitle: 'РЦКД Малмыж' }),
      ),
    ).toBe('Малмыжский районный Центр культуры и досуга')
    expect(
      institutionDisplayName(
        house({ title: 'Малмыжская детская школа искусств', shortTitle: null }),
      ),
    ).toBe('Малмыжская детская школа искусств')
  })

  // ДШИ и музей заведены в справочник 03.10 по письму Мозга. Короткая подпись у
  // них в базе есть («ДШИ», «Музей»), а показывать надо полное название: «ДШИ» в
  // списке из тридцати трёх пунктов не говорит посетителю ничего.
  it('ДШИ и музей показываем полным названием, несмотря на короткую подпись', () => {
    const dshi = house({
      slug: 'dshi',
      title: 'Детская школа искусств Малмыжа',
      shortTitle: 'ДШИ',
      settlement: 'г. Малмыж',
    })
    const muzej = house({
      slug: 'kraevedcheskiy-muzej',
      title: 'Краеведческий музей Малмыжа',
      shortTitle: 'Музей',
      settlement: 'г. Малмыж',
    })
    expect(institutionDisplayName(dshi)).toBe('Детская школа искусств Малмыжа')
    expect(institutionDisplayName(muzej)).toBe('Краеведческий музей Малмыжа')
    expect(institutionEmoji(dshi)).toBe('🎹')
    expect(institutionEmoji(muzej)).toBe('🏺')
  })

  it('ДШИ и музей находятся поиском и по названию, и по сокращению', () => {
    const dshi = house({ slug: 'dshi', title: 'Детская школа искусств Малмыжа', shortTitle: 'ДШИ' })
    expect(filterInstitutions([dshi], 'школа').map((i) => i.slug)).toEqual(['dshi'])
    expect(filterInstitutions([dshi], 'дши').map((i) => i.slug)).toEqual(['dshi'])
    expect(filterInstitutions([dshi], 'искусств').map((i) => i.slug)).toEqual(['dshi'])
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

// Готовые строки для показа: именно они приезжают в браузер. Здесь важно другое,
// чем в юнитах выше, — что в строке поиска НЕТ регистра и что подпись собрана
// верно. Регекс в `search` означал бы, что поиск перестал находить по буквам
// «КИТЯК» — и заметить это можно было бы только руками на живом сайте.
describe('готовая строка для показа', () => {
  const rows = toDirectoryRows(
    [house(), club(), house({ id: '9', slug: 'rckd', title: 'Малмыжский районный Центр культуры и досуга', shortTitle: 'РЦКД Малмыж', settlement: 'г. Малмыж', isHead: true, website: 'https://xn--d1amdcjpngc5fh.xn--80adkdyec4j.xn--p1ai/' })],
    (ref) => (ref.website ? 'домкультуры.вмалмыже.рф' : ''),
  )

  it('подпись и картинка считаются на сервере, до браузера', () => {
    expect(rows[0].name).toBe('Калинино')
    expect(rows[0].emoji).toBe('🎭')
    expect(rows[0].external).toBe(false)
    expect(rows[0].meta).toContain('с. Калинино')
  })

  it('головное учреждение помечено и ведёт наружу', () => {
    const head = rows[2]
    expect(head.external).toBe(true)
    expect(head.meta).toContain('головное учреждение')
    expect(head.name).toBe('Малмыжский районный Центр культуры и досуга')
  })

  it('строка поиска строчная — иначе поиск по капс молча перестал бы находить', () => {
    for (const row of rows) {
      expect(row.search).toBe(row.search.toLowerCase())
    }
    expect(filterRows(rows, 'КИТЯК')).toEqual([])
    expect(filterRows(rows, 'китяк')).toEqual([])
  })

  it('поиск по готовой строке совпадает с поиском по учреждению', () => {
    const q = 'калинино'
    const byRow = rows.filter((r) => matchesRow(r, q)).map((r) => r.id)
    const byInstitution = filterInstitutions([house(), club(), rows[2] as never], q)
    expect(byRow).toHaveLength(1)
    expect(byInstitution).toHaveLength(1)
  })

  it('пустой запрос отдаёт всё, в исходном порядке', () => {
    expect(filterRows(rows, '')).toBe(rows)
    expect(filterRows(rows, '  ')).toBe(rows)
  })
})