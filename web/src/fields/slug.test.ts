import { describe, expect, it } from 'vitest'

import { slugField } from './slug'

// Хук достаём из готового поля, а не тестируем formatSlug напрямую: приватная
// функция может остаться верной при том, что поле её больше не вызывает.
const field = slugField()
if (field.type !== 'text') throw new Error('slugField перестал быть текстовым полем')

const hook = field.hooks?.beforeValidate?.[0]
if (!hook) throw new Error('slugField потерял хук beforeValidate')

const run = async (value: unknown, data?: Record<string, unknown>): Promise<unknown> =>
  hook({ value, data } as unknown as Parameters<typeof hook>[0])

describe('slugField', () => {
  it('берёт slug из заголовка, когда поле пустое', async () => {
    await expect(run(undefined, { title: 'Концерт ко Дню села' })).resolves.toBe(
      'концерт-ко-дню-села',
    )
  })

  // Сайт живёт на IDN-домене, кириллический slug — осознанное решение, а не баг.
  it('сохраняет кириллицу', async () => {
    await expect(run(undefined, { title: 'Афиша' })).resolves.toBe('афиша')
  })

  it('нормализует slug, заданный руками', async () => {
    await expect(run('  Ручной SLUG!  ', { title: 'Заголовок' })).resolves.toBe('ручной-slug')
  })

  it('схлопывает пробелы и дефисы, режет пунктуацию и края', async () => {
    await expect(run(undefined, { title: '  Ёлка: 2026 — «главная»!  ' })).resolves.toBe(
      'ёлка-2026-главная',
    )
  })

  it('без заголовка не выдумывает slug, а возвращает как было', async () => {
    await expect(run(undefined, {})).resolves.toBeUndefined()
    await expect(run(null, undefined)).resolves.toBeNull()
  })

  it('поле для другого источника читает именно его', async () => {
    const nameField = slugField('name')
    if (nameField.type !== 'text') throw new Error('slugField перестал быть текстовым полем')
    const nameHook = nameField.hooks?.beforeValidate?.[0]
    if (!nameHook) throw new Error('slugField потерял хук beforeValidate')

    const result = await nameHook({
      value: undefined,
      data: { name: 'Сельский Дом культуры', title: 'не отсюда' },
    } as unknown as Parameters<typeof nameHook>[0])

    expect(result).toBe('сельский-дом-культуры')
  })
})
