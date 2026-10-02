import { lookup } from 'dns/promises'

import ipaddr from 'ipaddr.js'

// Безопасная скачивалка картинок для приёмника контента.
//
// Проблема, которую закрывает модуль: адрес картинки приходит от отправителя
// (`/api/ingest/posts`, тело `images[].url`), и до сих пор проверялся ровно на
// одну вещь — что строка начинается с `http`. Всё остальное адрес мог быть чем
// угодно: `http://127.0.0.1:5432/`, `http://169.254.169.254/…`, адрес чужого
// сервиса на общем боксе. Ответное тело никому не возвращается, но его КОД
// возвращается (см. `warnings` в маршруте приёмника) — этого достаточно, чтобы
// перебрать, что на машине открыто и куда приложение дотягивается.
//
// Три защиты, и каждая закрывает свой обход:
//
//  1. адрес резолвится, и все его IP должны быть глобальными. Список адресов
//     CDN ВК известен только на стороне ВК, поэтому белый список хостов здесь
//     был бы неверным решением: он молча ронял бы конвейер при любой смене
//     адреса у отправителя. А вот «адрес не должен быть внутренним» — это
//     свойство самого запроса, а не отправителя.
//  2. переадресации запрещены (`redirect: 'error'`). Иначе проверка первого
//     адреса проходит, а тело приезжает уже с другого — и проверять нечего.
//  3. размер ограничен. Без предела ответ читается в память целиком, а потом
//     ещё распаковывается при сжатии (см. `limitInputPixels` в Media).
//
// Проверка адресов — ровно та же логика, что в Payload (`safeFetch.js`:
// `ipaddr.parse(ip).range() !== 'unicast'`), но там она внутренняя и на наш
// путь не попадает: мы отдаём Payload уже скачанный буфер, а не адрес.
//
// Чего модуль НЕ делает, честно: между резолвом и соединением есть окно, в
// котором имя могло бы «повернуться» на внутренний адрес (DNS rebinding).
// Закрыть его можно только перехватом соединения (диспетчер undici), а это
// лишняя зависимость ради угрозы, которая и так требует ключа приёмника. Для
// нашей модели угроз этого достаточно; если ключ приёмника ever утечёт —
// возвращаться сюда за диспетчером.

/** Потолок на одну картинку. Фото из ВК — единицы мегабайт; 15 МБ — запас. */
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024

export type FetchedImage = { ok: true; buffer: Buffer; mimetype: string }
export type FetchFailure = { ok: false; reason: string }
export type FetchOutcome = FetchedImage | FetchFailure

/** Глобальный адрес — тот, за которым нет частной сети и служебных диапазонов. */
export function isPublicAddress(ip: string): boolean {
  try {
    if (!ipaddr.isValid(ip)) return false
    // `range()` умеет и в IPv4-mapped IPv6 (`::ffff:10.0.0.1` → private), так
    // что отдельная обработка IPv6 не нужна.
    return ipaddr.parse(ip).range() === 'unicast'
  } catch {
    return false
  }
}

/** Адрес, который отправитель указал буквально, без всякого резолва. */
export function isPublicHostname(hostname: string): boolean {
  const bare = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname
  // Не IP — значит имя, решение принимает резолв.
  if (!ipaddr.isValid(bare)) return true
  return isPublicAddress(bare)
}

export async function resolveAddresses(hostname: string): Promise<string[]> {
  const bare = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname
  const found = await lookup(bare, { all: true })
  return found.map((entry) => entry.address)
}

/**
 * Скачивает картинку или объясняет, почему не скачал. Никогда не бросает и
 * никогда не возвращает частично скачанные байты.
 */
export async function fetchImageBytes(
  url: string,
  opts: { timeoutMs: number; maxBytes?: number },
): Promise<FetchOutcome> {
  const maxBytes = opts.maxBytes ?? MAX_IMAGE_BYTES
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, reason: 'адрес не разобран' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'схема не http(s)' }
  }
  if (!isPublicHostname(parsed.hostname)) {
    return { ok: false, reason: 'адрес указывает внутрь сети' }
  }

  try {
    const addresses = await resolveAddresses(parsed.hostname)
    if (addresses.length === 0) return { ok: false, reason: 'имя не разрешилось' }
    // Проверяем ВСЕ адреса, а не первый: имя с несколькими A-записями, из
    // которых один внутренний, — это ровно тот случай, ради которого список
    // «а не приватный ли первый» не годится.
    if (!addresses.every(isPublicAddress)) {
      return { ok: false, reason: 'имя разрешается во внутреннюю сеть' }
    }
  } catch {
    return { ok: false, reason: 'имя не разрешилось' }
  }

  let res: Response
  try {
    res = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(opts.timeoutMs),
    })
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'запрос не прошёл' }
  }
  if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` }

  // Заголовок врёт чаще, чем сам поток, но если он честный — экономим чтение.
  const declared = Number(res.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, reason: `файл больше ${maxBytes} байт` }
  }

  try {
    const buffer = await readCapped(res, maxBytes)
    if (!buffer) return { ok: false, reason: `файл больше ${maxBytes} байт` }
    return {
      ok: true,
      buffer,
      mimetype: res.headers.get('content-type') || 'application/octet-stream',
    }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'чтение не удалось' }
  }
}

/**
 * Читает поток с счётчиком байт и рвёт его на превышении.
 *
 * `arrayBuffer()` не годится: он сначала дожидается всего тела и только потом
 * проверяет наш предел — то есть предел оказывается бесполезен ровно в том
 * случае, ради которого написан.
 */
async function readCapped(res: Response, maxBytes: number): Promise<Buffer | null> {
  const body = res.body
  if (!body) {
    const buffer = Buffer.from(await res.arrayBuffer())
    return buffer.length > maxBytes ? null : buffer
  }
  const reader = body.getReader()
  const chunks: Buffer[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(Buffer.from(value))
  }
  return Buffer.concat(chunks)
}