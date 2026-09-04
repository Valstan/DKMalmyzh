import { describe, expect, it } from 'vitest'

import { describeError, vkSlug } from './import'

// Тесты на два свойства, которых импорту не хватало и которые нельзя проверить
// глазами: адрес записи обязан быть уникальным, а сообщение об ошибке не должно
// выносить серверный путь в публичный лог.

describe('slug импортированной записи', () => {
  it('две записи с одинаковым текстом получают разные адреса', () => {
    const text = 'Приглашаем на концерт'
    const a = vkSlug(text, '-123_1', '2026-09-04T10:00:00.000Z')
    const b = vkSlug(text, '-123_2', '2026-09-04T10:00:00.000Z')
    expect(a).not.toBe(b)
  })

  it('запись без текста получает адрес, а не пустую строку', () => {
    const slug = vkSlug('', '-123_7', '2026-09-04T10:00:00.000Z')
    expect(slug.length).toBeGreaterThan(0)
    expect(slug).toContain('123-7')
  })

  it('адрес не содержит пробелов, слэшей и служебных символов', () => {
    const slug = vkSlug('Афиша: «Ночь искусств» — 4/11, вход свободный!', '-1_2', '2026-09-04T00:00:00.000Z')
    expect(slug).toMatch(/^[\p{L}\p{N}-]+$/u)
  })

  it('длинный заголовок обрезается, но остаётся уникальным', () => {
    const long = 'а'.repeat(300)
    const a = vkSlug(long, '-9_1', '2026-09-04T00:00:00.000Z')
    const b = vkSlug(long, '-9_2', '2026-09-04T00:00:00.000Z')
    expect(a.length).toBeLessThan(90)
    expect(a).not.toBe(b)
  })
})

describe('описание ошибки для публичного лога', () => {
  it('вырезает абсолютный путь из системной ошибки записи файла', () => {
    const err = new Error("ENOSPC: no space left on device, open '/home/valstan/dkmalmyzh/shared/media/vk-1.jpg'")
    const text = describeError(err)
    expect(text).toContain('ENOSPC')
    expect(text).not.toContain('/home/')
    expect(text).not.toContain('dkmalmyzh/shared')
  })

  it('вырезает путь без кавычек', () => {
    const text = describeError(new Error('EACCES: permission denied /var/lib/media/photo.jpg'))
    expect(text).not.toContain('/var/lib')
    expect(text).toContain('EACCES')
  })

  it('обычное сообщение не портит', () => {
    expect(describeError(new Error('шлюз ответил HTTP 502'))).toBe('шлюз ответил HTTP 502')
  })

  it('не-ошибку описывает словами', () => {
    expect(describeError('строка')).toBe('неизвестная ошибка')
  })
})
