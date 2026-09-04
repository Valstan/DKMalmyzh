import { randomUUID } from 'crypto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { guardInternal } from './auth'

// Единственная авторизация пишущих служебных маршрутов до сих пор не была покрыта
// ничем: `guardInternal` вызывается только из двух route.ts, а их не исполняет ни
// один гейт. Рефакторинг, снимающий 503 при незаданном секрете («на dev-стенде
// мешает»), оставил бы весь CI зелёным, а на проде барьером остался бы только
// `deny` в nginx.

const HEADER = 'x-internal-secret'

// Значение генерируется, а не лежит литералом: строка с высокой энтропией в
// отслеживаемом файле — находка для сканера секретов, и правильно: отличить
// «тестовая константа» от «забытый ключ» он не обязан. Заодно каждый прогон
// проверяет сравнение на разной строке.
const SECRET = `unit-${randomUUID()}`

// Пробелы по краям значения заголовка HTTP обрезает сам — отдельного кейса на них
// нет намеренно: такой запрос неотличим от точного совпадения ещё до нашего кода.
const request = (headers: Record<string, string> = {}) =>
  new Request('http://127.0.0.1:3005/internal/vk-sync', { method: 'POST', headers })

describe('охрана служебных маршрутов', () => {
  const saved = process.env.INTERNAL_OPS_SECRET

  beforeEach(() => {
    process.env.INTERNAL_OPS_SECRET = SECRET
  })

  afterEach(() => {
    if (saved === undefined) delete process.env.INTERNAL_OPS_SECRET
    else process.env.INTERNAL_OPS_SECRET = saved
  })

  it('пропускает запрос с точным секретом', () => {
    expect(guardInternal(request({ [HEADER]: SECRET }), 'импорт')).toBeNull()
  })

  it('без заголовка — 403', async () => {
    const denial = guardInternal(request(), 'импорт')
    expect(denial).not.toBeNull()
    expect(denial?.response.status).toBe(403)
  })

  it.each([
    ['пустой', ''],
    ['неверный той же длины', 'x'.repeat(SECRET.length)],
    ['укороченный', SECRET.slice(0, -1)],
    ['удлинённый', SECRET + 'x'],
    ['в другом регистре', SECRET.toUpperCase()],
  ])('заголовок %s — 403', (_name, value) => {
    const denial = guardInternal(request({ [HEADER]: value }), 'импорт')
    expect(denial?.response.status).toBe(403)
  })

  // Главное свойство: незаданный секрет выключает маршрут, а не открывает его.
  // Пустая строка совпала бы с пустым заголовком, и служебная ручка оказалась бы
  // открытой ровно там, где её забыли настроить.
  it.each([
    ['не задан', undefined],
    ['пустой', ''],
    ['из пробелов', '   '],
  ])('секрет %s — 503 и маршрут выключен даже при пустом заголовке', async (_name, value) => {
    if (value === undefined) delete process.env.INTERNAL_OPS_SECRET
    else process.env.INTERNAL_OPS_SECRET = value

    const denial = guardInternal(request({ [HEADER]: '' }), 'импорт')
    expect(denial).not.toBeNull()
    expect(denial?.response.status).toBe(503)

    const body = (await denial?.response.json()) as { error: string }
    expect(body.error).toContain('INTERNAL_OPS_SECRET')
  })

  it('название операции попадает в отказ 503 — по нему видно, что именно выключено', async () => {
    delete process.env.INTERNAL_OPS_SECRET
    const denial = guardInternal(request(), 'заведение каталога')
    const body = (await denial?.response.json()) as { error: string }
    expect(body.error).toContain('заведение каталога')
  })
})
