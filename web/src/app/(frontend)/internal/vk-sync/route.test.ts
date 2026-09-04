import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Тест на МАРШРУТ, а не на модуль замка. Замок покрыт своими юнитами, но они
// остаются зелёными, если из обработчика убрать его вызов или вернуть прежнюю
// форму — взятие после `await getPayload(...)`. Ровно эта форма и дала аварию
// 04.09: таймер запустил второй прогон поверх первого.
//
// Payload и сам импорт замоканы: проверяется поведение обработчика, а не работа
// с БД и шлюзом.

const runVkSync = vi.fn()
const getPayload = vi.fn()

vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ getPayload: (...args: unknown[]) => getPayload(...args) }))
vi.mock('../../../../lib/vk/sync', () => ({
  runVkSync: (...args: unknown[]) => runVkSync(...args),
}))

const SECRET = 'route-test-secret'
const HEADER = 'x-internal-secret'

const post = async () => {
  const { POST } = await import('./route')
  return POST(
    new Request('http://127.0.0.1:3005/internal/vk-sync', {
      method: 'POST',
      headers: { [HEADER]: SECRET },
    }),
  )
}

describe('POST /internal/vk-sync', () => {
  const saved = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    runVkSync.mockReset()
    getPayload.mockReset()
    process.env.INTERNAL_OPS_SECRET = SECRET
    process.env.SARAFAN_GATEWAY_URL = 'https://gateway.invalid'
    process.env.SARAFAN_GATEWAY_KEY = 'k'
    // Инициализация Payload — медленная точка ожидания: между проверкой замка и
    // его взятием в прежней версии успевал встать второй запрос.
    getPayload.mockImplementation(
      async () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ logger: { info: vi.fn(), error: vi.fn() } }), 10),
        ),
    )
    runVkSync.mockImplementation(
      async () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ institutions: 1, sources: 1, created: 0, skipped: 0, failed: 0, messages: [] }), 20),
        ),
    )
  })

  afterEach(() => {
    process.env = { ...saved }
  })

  it('два одновременных запроса: работает ровно один, второй получает 409', async () => {
    const [a, b] = await Promise.all([post(), post()])
    const codes = [a.status, b.status].sort()

    expect(codes).toEqual([200, 409])
    expect(runVkSync).toHaveBeenCalledTimes(1)

    const busy = a.status === 409 ? a : b
    const body = (await busy.json()) as { error: string }
    expect(body.error).toContain('уже идёт')
  })

  it('после завершения прогона замок отпускается', async () => {
    const first = await post()
    expect(first.status).toBe(200)

    const second = await post()
    expect(second.status).toBe(200)
    expect(runVkSync).toHaveBeenCalledTimes(2)
  })

  it('замок отпускается и когда прогон упал', async () => {
    runVkSync.mockRejectedValueOnce(new Error('шлюз недоступен'))
    const failed = await post()
    expect(failed.status).toBe(500)

    const next = await post()
    expect(next.status).toBe(200)
  })

  it('без ключа шлюза — 503, и замок не остаётся занятым', async () => {
    delete process.env.SARAFAN_GATEWAY_KEY
    const denied = await post()
    expect(denied.status).toBe(503)

    process.env.SARAFAN_GATEWAY_KEY = 'k'
    const next = await post()
    expect(next.status).toBe(200)
  })

  it('без секрета маршрут выключен, а не открыт', async () => {
    delete process.env.INTERNAL_OPS_SECRET
    const { POST } = await import('./route')
    const res = await POST(
      new Request('http://127.0.0.1:3005/internal/vk-sync', { method: 'POST' }),
    )
    expect(res.status).toBe(503)
    expect(runVkSync).not.toHaveBeenCalled()
  })
})
