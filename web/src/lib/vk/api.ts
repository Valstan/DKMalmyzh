// Доступ к ВК — ТОЛЬКО через шлюз SARAFAN (проект setka), никогда напрямую.
//
// Это архитектурное правило экосистемы, а не наше предпочтение (pool #062,
// реестр `brain_matrica/access/INDEX.md`): привилегированный доступ к ВК есть у
// одного проекта, остальные ходят через него сервисом. Причина не только в том,
// что N копий токена = N точек утечки: VK привязывает user-токен к IP выпуска,
// и наш токен с нашего бокса получил бы `error 5 access_token was given to
// another ip`. Раздача credential технически не работает — работает только
// «исполни своим токеном и верни результат».
//
// В том же реестре записан и анти-паттерн: у соседа рядом с ключом шлюза остался
// fallback на сырые VK-токены, и «отзыв ключа сегодня ничего не отзывает».
// Поэтому здесь fallback'а на прямой api.vk.com НЕТ вовсе.
//
// Контракт: `setka/docs/GATEWAY.md` — `POST {URL}/api/gateway/call`,
// заголовок `X-API-Key`, тело `{method, params}`, ответ
// `{ok: true, response}` либо `{ok: false, error: {error_code, error_msg}}`.

export type VkPhotoSize = { url?: string; width?: number; height?: number; type?: string }

export type VkAttachment = {
  type?: string
  photo?: { id?: number; owner_id?: number; sizes?: VkPhotoSize[] }
}

export type VkWallItem = {
  id?: number
  owner_id?: number
  from_id?: number
  date?: number
  text?: string
  marked_as_ads?: number
  is_pinned?: number
  attachments?: VkAttachment[]
  copy_history?: VkWallItem[]
}

export type VkWallResponse = { count?: number; items?: VkWallItem[] }

export type GatewayConfig = { url: string; key: string }

export class VkError extends Error {
  constructor(
    readonly code: number,
    message: string,
    /** Сколько секунд просил подождать шлюз (429). */
    readonly retryAfterSec?: number,
  ) {
    super(message)
    this.name = 'VkError'
  }
}

// Адрес шлюза НЕ захардкожен: это хостнейм чужой инфраструктуры, а такие в
// отслеживаемых файлах не хранятся (AGENTS.md §Recon-поверхность). Плюс шлюз
// переезжал вместе с VPS — значение по месту надёжнее константы в коде.
export function readGatewayConfig(env: Record<string, string | undefined>): GatewayConfig | null {
  const url = env.SARAFAN_GATEWAY_URL?.trim().replace(/\/$/, '')
  const key = env.SARAFAN_GATEWAY_KEY?.trim()
  if (!url || !key) return null
  return { url, key }
}

type Params = Record<string, string | number>

async function call<T>(method: string, params: Params, cfg: GatewayConfig): Promise<T> {
  const res = await fetch(`${cfg.url}/api/gateway/call`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': cfg.key },
    body: JSON.stringify({ method, params }),
    // Без дедлайна зависшее соединение держит прогон бесконечно: клиент (curl
    // юнита) давно ушёл по --max-time, а обработчик продолжает работать и
    // держит замок служебных операций — импорт встаёт молча.
    signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
  })

  if (res.status === 429) {
    // Шлюз держит общий бюджет на всех потребителей — сюда упираются законно,
    // и ждать надо ровно столько, сколько он просит.
    const retry = Number(res.headers.get('retry-after')) || 60
    throw new VkError(429, `${method}: шлюз просит подождать ${retry} с`, retry)
  }
  if (res.status === 401) throw new VkError(401, `${method}: ключ шлюза не принят`)
  if (res.status === 400) throw new VkError(400, `${method}: метод вне allowlist шлюза`)
  if (res.status === 503) throw new VkError(503, `${method}: шлюз недоступен`)
  if (!res.ok) throw new VkError(0, `${method}: шлюз ответил HTTP ${res.status}`)

  const json = (await res.json()) as {
    ok?: boolean
    response?: T
    error?: { error_code?: number; error_msg?: string }
  }

  // Доменная ошибка ВК (закрытая стена, удалённое сообщество) приезжает с
  // HTTP 200 и ok: false — на код ответа тут смотреть нельзя.
  if (json.ok === false || json.error) {
    throw new VkError(
      json.error?.error_code ?? 0,
      `${method}: ${json.error?.error_msg ?? 'ошибка ВК'}`,
    )
  }
  if (json.response === undefined) throw new VkError(0, `${method}: пустой ответ шлюза`)
  return json.response
}

/** owner_id по короткому имени. Сообщество отдаётся отрицательным. */
export async function resolveOwnerId(screenName: string, cfg: GatewayConfig): Promise<number | null> {
  const res = await call<{ type?: string; object_id?: number }>(
    'utils.resolveScreenName',
    { screen_name: screenName },
    cfg,
  )
  if (!res || !res.object_id) return null
  if (res.type === 'group' || res.type === 'page' || res.type === 'event') return -res.object_id
  if (res.type === 'user') return res.object_id
  return null
}

export async function wallGet(
  ownerId: number,
  count: number,
  cfg: GatewayConfig,
): Promise<VkWallResponse> {
  return call<VkWallResponse>('wall.get', { owner_id: ownerId, count, extended: 0 }, cfg)
}

// Пауза между вызовами шлюза. Квота ключа по умолчанию — 30 запросов в минуту
// (GATEWAY_QUOTA_PER_MIN в setka), то есть 2 с на запрос. Прежние 400 мс —
// расчёт под прямой VK API — упирались бы в 429 уже на первом десятке
// учреждений, и стены оставшихся выглядели бы пустыми.
export const GATEWAY_PACE_MS = Number(process.env.SARAFAN_PACE_MS || 2100)

/** Дедлайн одного обращения к шлюзу. Шлюз соседний, но канал общий. */
export const GATEWAY_TIMEOUT_MS = Number(process.env.SARAFAN_TIMEOUT_MS || 30000)
