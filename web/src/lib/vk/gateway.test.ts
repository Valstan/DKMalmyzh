import { afterEach, describe, expect, it, vi } from 'vitest'

import { VkError, resolveOwnerId, wallGet } from './api'

// Разбор ответов шлюза SARAFAN. Проверяется на подменённом fetch: сети и ключа
// здесь нет, а логика — есть, и она неочевидна. Главная её часть: доменная
// ошибка ВК приезжает с HTTP 200 и `ok: false`, то есть смотреть только на код
// ответа нельзя — так молча импортировалась бы пустота вместо стены.

const GW = { url: 'https://gateway.invalid', key: 'test-key-not-real' }

function mockFetch(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
) {
  const fn = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status: init.status ?? 200,
        headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
      }),
  )
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('вызов шлюза', () => {
  it('шлёт метод и параметры на /api/gateway/call с ключом в заголовке', async () => {
    const fn = mockFetch({ ok: true, response: { count: 0, items: [] } })

    await wallGet(-123, 5, GW)

    expect(fn).toHaveBeenCalledTimes(1)
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://gateway.invalid/api/gateway/call')
    expect((init.headers as Record<string, string>)['x-api-key']).toBe(GW.key)
    expect(JSON.parse(init.body as string)).toEqual({
      method: 'wall.get',
      params: { owner_id: -123, count: 5, extended: 0 },
    })
  })

  it('возвращает сырой payload ВК из поля response', async () => {
    mockFetch({ ok: true, response: { count: 2, items: [{ id: 1 }, { id: 2 }] } })
    await expect(wallGet(-1, 2, GW)).resolves.toEqual({ count: 2, items: [{ id: 1 }, { id: 2 }] })
  })

  // Ровно тот случай, ради которого этот файл и написан.
  it('ok: false при HTTP 200 — это ошибка, а не пустая стена', async () => {
    mockFetch({ ok: false, error: { error_code: 15, error_msg: 'Access denied' } })
    await expect(wallGet(-1, 5, GW)).rejects.toMatchObject({ code: 15 })
  })

  it('429 несёт Retry-After — по нему синхронизация решает, сколько ждать', async () => {
    mockFetch({ error: 'quota' }, { status: 429, headers: { 'retry-after': '17' } })
    await expect(wallGet(-1, 5, GW)).rejects.toMatchObject({ code: 429, retryAfterSec: 17 })
  })

  it('429 без заголовка даёт разумное умолчание, а не NaN', async () => {
    mockFetch({ error: 'quota' }, { status: 429 })
    const err = await wallGet(-1, 5, GW).catch((e) => e as VkError)
    expect(err).toBeInstanceOf(VkError)
    expect((err as VkError).retryAfterSec).toBe(60)
  })

  it('коды шлюза различимы: 401 ключ, 400 метод вне allowlist, 503 выключен', async () => {
    for (const [status, code] of [
      [401, 401],
      [400, 400],
      [503, 503],
    ] as const) {
      mockFetch({}, { status })
      await expect(wallGet(-1, 5, GW)).rejects.toMatchObject({ code })
    }
  })

  it('успех без поля response — тоже ошибка: импортировать нечего', async () => {
    mockFetch({ ok: true })
    await expect(wallGet(-1, 5, GW)).rejects.toBeInstanceOf(VkError)
  })
})

describe('resolveOwnerId', () => {
  it('сообщество даёт ОТРИЦАТЕЛЬНЫЙ owner_id', async () => {
    mockFetch({ ok: true, response: { type: 'group', object_id: 217788511 } })
    await expect(resolveOwnerId('dk_malmyzh', GW)).resolves.toBe(-217788511)
  })

  it('публичная страница — тоже сообщество', async () => {
    mockFetch({ ok: true, response: { type: 'page', object_id: 179595292 } })
    await expect(resolveOwnerId('some_public', GW)).resolves.toBe(-179595292)
  })

  it('личная страница даёт положительный owner_id', async () => {
    mockFetch({ ok: true, response: { type: 'user', object_id: 444820854 } })
    await expect(resolveOwnerId('some_user', GW)).resolves.toBe(444820854)
  })

  it('неизвестный тип и пустой ответ дают null — импорт такое пропустит', async () => {
    mockFetch({ ok: true, response: { type: 'application', object_id: 7 } })
    await expect(resolveOwnerId('app', GW)).resolves.toBeNull()

    mockFetch({ ok: true, response: {} })
    await expect(resolveOwnerId('nobody', GW)).resolves.toBeNull()
  })
})
