import { describe, expect, it } from 'vitest'

import { isMentionFeed, mentionStems, stemsFromSettlement } from './mentionFeed'

// Лента раздела без своего сообщества: заголовки по упоминанию населённого
// пункта. Признак раздела и основы — чистая логика, проверяется без БД.
describe('isMentionFeed', () => {
  it('помечены ровно те три раздела, где своего сообщества нет', () => {
    expect(isMentionFeed('nosly')).toBe(true)
    expect(isMentionFeed('deryushevo')).toBe(true)
    expect(isMentionFeed('malyy-kityak')).toBe(true)
  })

  it('остальные разделы живут по-своему', () => {
    expect(isMentionFeed('rckd')).toBe(false)
    expect(isMentionFeed('kalinino')).toBe(false)
    expect(isMentionFeed('gonba')).toBe(false)
    expect(isMentionFeed('такого-дк-нет')).toBe(false)
  })
})

describe('stemsFromSettlement', () => {
  it('отбрасывает тип населённого пункта', () => {
    expect(stemsFromSettlement('д. Нослы')).toEqual(['носл'])
    expect(stemsFromSettlement('с. Дерюшево')).toEqual(['дерюше'])
  })

  it('у прилагательного срезает два знака — иначе родительный падеж не ловится', () => {
    // «Малый Китяк» в заголовке легко пишут как «Малого Китяка»: основа «малы»
    // туда не подошла бы, а «мал» ловит и «малый», и «Малого».
    expect(stemsFromSettlement('д. Малый Китяк')).toEqual(['мал', 'китя'])
  })

  it('у трёх разделов — основы, по которым реально ищем', () => {
    expect(mentionStems('nosly')).toEqual(['носл'])
    expect(mentionStems('deryushevo')).toEqual(['дерюше'])
    expect(mentionStems('malyy-kityak')).toEqual(['мал', 'китя'])
  })

  it('мусор и пусто — пустой список, а не ложное совпадение по всем словам', () => {
    expect(stemsFromSettlement('')).toEqual([])
    expect(stemsFromSettlement(null)).toEqual([])
  })

  it('основы есть и у обычных разделов, но используются только помеченные', () => {
    expect(mentionStems('rckd')).toEqual(['малмы'])
    expect(isMentionFeed('rckd')).toBe(false)
  })
})
