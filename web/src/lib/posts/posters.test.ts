import { describe, expect, it } from 'vitest'

import { classifyEmptyTitle, isDerivedTitle, posterTitle } from './posters'

describe('isDerivedTitle', () => {
  it('ловит формат своего мотора с подписью дома', () => {
    expect(isDerivedTitle('РЦКД Малмыж: запись от 2026-09-29')).toBe(true)
  })
  it('ловит формат приёмника без подписи', () => {
    expect(isDerivedTitle('Запись от 2026-09-29')).toBe(true)
  })
  it('ловит строчную запись', () => {
    expect(isDerivedTitle('мелеть: запись от 2024-05-09')).toBe(true)
  })
  it('не трогает обычные заголовки', () => {
    expect(isDerivedTitle('КРОСС НАЦИИ — 2026!')).toBe(false)
    expect(isDerivedTitle('Пост удалён')).toBe(false)
    expect(isDerivedTitle('27 августа 2026г.')).toBe(false)
  })
  it('не считает пустышкой запись без даты', () => {
    expect(isDerivedTitle('запись от вчера')).toBe(false)
  })
  it('пустое и нестрока — не пустышка', () => {
    expect(isDerivedTitle('')).toBe(false)
    expect(isDerivedTitle(null)).toBe(false)
    expect(isDerivedTitle(undefined)).toBe(false)
  })
})

describe('posterTitle', () => {
  it('афиша датирована датой оригинала, а не сегодня', () => {
    expect(posterTitle('2026-09-29T17:26:17.000Z')).toBe('Афиша от 2026-09-29')
  })
})

describe('classifyEmptyTitle', () => {
  it('одно фото без текста — афиша', () => {
    expect(
      classifyEmptyTitle({ title: 'Порез: запись от 2026-09-29', text: '', photoCount: 1, videoCount: 0 }),
    ).toBe('poster')
  })
  it('ни текста, ни фото, ни видео — удалить', () => {
    expect(
      classifyEmptyTitle({ title: 'Запись от 2026-09-29', text: '', photoCount: 0, videoCount: 0 }),
    ).toBe('empty')
  })
  it('пробельный текст — всё равно пусто', () => {
    expect(
      classifyEmptyTitle({ title: 'Запись от 2026-09-29', text: '  \n ', photoCount: 1, videoCount: 0 }),
    ).toBe('poster')
  })
  it('альбом из нескольких фото без текста — оставляем (заказа не было)', () => {
    expect(
      classifyEmptyTitle({ title: 'Пор-Китяк: запись от 2019-05-24', text: '', photoCount: 5, videoCount: 0 }),
    ).toBe('leave')
  })
  it('видео без текста — содержание есть, оставляем', () => {
    expect(
      classifyEmptyTitle({ title: 'Запись от 2026-09-29', text: '', photoCount: 0, videoCount: 1 }),
    ).toBe('leave')
  })
  it('текст есть, пусть и с пустышкой в заголовке, — не наше дело', () => {
    expect(
      classifyEmptyTitle({ title: 'Запись от 2026-09-29', text: 'Текст дописал редактор', photoCount: 1, videoCount: 0 }),
    ).toBe('leave')
  })
  it('обычный заголовок без текста — не кандидат вовсе', () => {
    expect(classifyEmptyTitle({ title: 'Концерт', text: '', photoCount: 0, videoCount: 0 })).toBe('leave')
  })
  it('эмодзи — тоже содержание', () => {
    expect(
      classifyEmptyTitle({ title: 'Запись от 2026-06-13', text: '❤️', photoCount: 0, videoCount: 0 }),
    ).toBe('leave')
  })
})
