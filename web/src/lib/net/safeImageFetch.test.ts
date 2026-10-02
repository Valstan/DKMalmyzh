import { describe, expect, it } from 'vitest'

import {
  fetchImageBytes,
  isPublicAddress,
  isPublicHostname,
  MAX_IMAGE_BYTES,
  resolveAddresses,
} from './safeImageFetch'

// Гейт к аудиту #057: приёмник контента заставлял сервер ходить по адресу,
// который прислал отправитель, и проверял только схему адреса. Здесь закрыты
// три класса обхода, и каждый deserves свой тест — иначе проверка выглядит
// «есть», а на деле проверяет одну строку.

// Тест на ПУБЛИЧНЫЙ адрес: у github.com есть и IPv4, и IPv6, оба глобальные.
describe('isPublicAddress', () => {
  it('принимает обычные глобальные адреса', () => {
    expect(isPublicAddress('93.184.216.34')).toBe(true)
    expect(isPublicAddress('8.8.8.8')).toBe(true)
    expect(isPublicAddress('2606:2800:220:1:248:1893:25c8:1946')).toBe(true)
  })

  it('отбрасывает внутренние и служебные диапазоны IPv4', () => {
    for (const ip of [
      '127.0.0.1', //          сам бокс
      '10.0.0.5', //           приватная сеть
      '172.16.0.1', //         приватная сеть
      '192.168.1.1', //        приватная сеть
      '169.254.169.254', //    служебный адрес метаданных
      '0.0.0.0', //            «слушаю всё»
      '100.64.0.1', //         канальный диапазон
      '224.0.0.1', //         multicast
      '255.255.255.255', //    broadcast
    ]) {
      expect(isPublicAddress(ip), ip).toBe(false)
    }
  })

  it('отбрасывает внутренние диапазоны IPv6', () => {
    for (const ip of ['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1']) {
      expect(isPublicAddress(ip), ip).toBe(false)
    }
  })

  it('разворачивает IPv4-в-IPv6: ::ffff:10.0.0.1 — это приватный адрес', () => {
    // Самая неприятная форма обхода: адрес выглядит «не-IP», но ровно им и
    // является после разбора.
    expect(isPublicAddress('::ffff:10.0.0.1')).toBe(false)
    expect(isPublicAddress('::ffff:127.0.0.1')).toBe(false)
  })

  it('мусор вместо адреса — не адрес', () => {
    expect(isPublicAddress('не адрес')).toBe(false)
    expect(isPublicAddress('')).toBe(false)
    expect(isPublicAddress('999.1.1.1')).toBe(false)
  })
})

describe('isPublicHostname', () => {
  it('буквальный внутренний IP отбрасывается сразу, без резолва', () => {
    expect(isPublicHostname('127.0.0.1')).toBe(false)
    expect(isPublicHostname('[::1]')).toBe(false)
    expect(isPublicHostname('[::1]')).toBe(false)
  })

  it('буквальный глобальный IP проходит', () => {
    expect(isPublicHostname('93.184.216.34')).toBe(true)
  })

  it('имя хоста решается только резолвом', () => {
    expect(isPublicHostname('example.com')).toBe(true)
    expect(isPublicHostname('localhost')).toBe(true) // не IP — отбработает resolveAddresses
  })
})

describe('resolveAddresses', () => {
  it('localhost резолвится в 127.0.0.1 и в ::1', async () => {
    const addresses = await resolveAddresses('localhost')
    expect(addresses.length).toBeGreaterThan(0)
    expect(addresses.every((ip) => !isPublicAddress(ip))).toBe(true)
  })

  it('пустое имя не резолвится ни во что — и это не «повод идти»', async () => {
    // Проверка ветки «список адресов пуст». Намеренно НЕ несуществующий домен:
    // его резолвинг упирается в сеть и делает тест медленным и нестабильным,
    // а проверять тут надо нашу логику, а не работу резолвера.
    const addresses = await resolveAddresses('')
    expect(addresses).toEqual([])
  })
})

describe('fetchImageBytes', () => {
  const opts = { timeoutMs: 2000, maxBytes: 1024 }

  it('не ходит по адресу, указанному буквально внутрь сети', async () => {
    // Ключевая проверка: сетевого вызова быть НЕ должно. Если тест внезапно
    // станет «висеть на 127.0.0.1», значит защита перестала работать и запрос
    // ушёл в сеть — этот тест ловит именно это.
    const got = await fetchImageBytes('http://127.0.0.1:9/картинка.jpg', opts)
    expect(got.ok).toBe(false)
    if (!got.ok) expect(got.reason).toMatch(/внутрь/)
  })

  it('не ходит по служебному адресу метаданных', async () => {
    const got = await fetchImageBytes('http://169.254.169.254/latest/meta-data/', opts)
    expect(got.ok).toBe(false)
    if (!got.ok) expect(got.reason).toMatch(/внутрь/)
  })

  it('не принимает имя, которое резолвится во внутреннюю сеть', async () => {
    const got = await fetchImageBytes('http://localhost:9/картинка.jpg', opts)
    expect(got.ok).toBe(false)
    if (!got.ok) expect(got.reason).toMatch(/внутреннюю сеть/)
  })

  it('отсекает схему, отличную от http(s)', async () => {
    for (const url of ['file:///etc/passwd', 'ftp://example.com/a.jpg', 'data:image/jpeg;base64,AA']) {
      const got = await fetchImageBytes(url, opts)
      expect(got.ok, url).toBe(false)
      if (!got.ok) expect(got.reason).toMatch(/схема/)
    }
  })

  it('мусорный адрес не роняет, а объясняет', async () => {
    const got = await fetchImageBytes('не адрес', opts)
    expect(got.ok).toBe(false)
    if (!got.ok) expect(got.reason).toMatch(/не разобран/)
  })

  it('имя без адресов — отказ, а не запрос', async () => {
    const got = await fetchImageBytes('http://:80/картинка.jpg', opts)
    expect(got.ok).toBe(false)
  })
})

describe('MAX_IMAGE_BYTES', () => {
  it('предел стоит там, где он нужен, и не равен нулю', () => {
    // Число зафиксировано осознанно: слишком мало — отвалятся настоящие фото,
    // слишком много — вернётся память, ради ограничения которой всё затевалось.
    expect(MAX_IMAGE_BYTES).toBe(15 * 1024 * 1024)
  })
})