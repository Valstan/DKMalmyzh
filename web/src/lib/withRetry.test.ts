import { describe, expect, it, vi } from 'vitest'

import { withRetry } from './withRetry'

// baseMs: 1 везде, где важен только счётчик попыток: боевые паузы (150/300 мс)
// превратили бы дешёвый гейт в секунды ожидания на ровном месте.
describe('withRetry', () => {
  it('успех с первой попытки — один вызов и никаких пауз', async () => {
    const fn = vi.fn(async () => 'ок')
    await expect(withRetry(fn)).resolves.toBe('ок')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('транзиентный сбой гасится ретраем', async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce('ок')

    await expect(withRetry(fn, { baseMs: 1 })).resolves.toBe('ок')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('исчерпав попытки, пробрасывает ошибку — вызывающий сам решает про 404', async () => {
    const fn = vi.fn(async () => {
      throw new Error('БД лежит')
    })

    await expect(withRetry(fn, { tries: 3, baseMs: 1 })).rejects.toThrow('БД лежит')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('пробрасывает ПОСЛЕДНЮЮ ошибку, а не первую', async () => {
    const fn = vi
      .fn<() => Promise<never>>()
      .mockRejectedValueOnce(new Error('первая'))
      .mockRejectedValueOnce(new Error('вторая'))
      .mockRejectedValueOnce(new Error('третья'))

    await expect(withRetry(fn, { tries: 3, baseMs: 1 })).rejects.toThrow('третья')
  })

  it('tries: 1 — ретраев нет вовсе', async () => {
    const fn = vi.fn(async () => {
      throw new Error('раз и всё')
    })

    await expect(withRetry(fn, { tries: 1, baseMs: 1 })).rejects.toThrow('раз и всё')
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
