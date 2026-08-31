// Тонкий клиент VK API — ровно два метода, которые нужны импорту.
//
// Токен читается из окружения и НИКОГДА не логируется: сообщения об ошибках
// собираются из полей ответа, а не из URL запроса (в URL токен и лежит).

const API = 'https://api.vk.com/method'
const VERSION = '5.199'

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

export class VkError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message)
    this.name = 'VkError'
  }
}

type Params = Record<string, string | number>

async function call<T>(method: string, params: Params, token: string): Promise<T> {
  const body = new URLSearchParams({ ...toStrings(params), access_token: token, v: VERSION })

  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) throw new VkError(0, `${method}: HTTP ${res.status}`)

  const json = (await res.json()) as { response?: T; error?: { error_code?: number; error_msg?: string } }
  if (json.error) {
    throw new VkError(json.error.error_code ?? 0, `${method}: ${json.error.error_msg ?? 'ошибка VK'}`)
  }
  if (json.response === undefined) throw new VkError(0, `${method}: пустой ответ`)
  return json.response
}

function toStrings(params: Params): Record<string, string> {
  return Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
}

// Токен передаётся параметром, а не читается внутри: так функции остаются
// проверяемыми, а место чтения секрета — ровно одно (скрипт синхронизации).
export function readVkToken(env: Record<string, string | undefined>): string | null {
  const token = env.VK_SERVICE_TOKEN?.trim()
  return token ? token : null
}

/** owner_id по короткому имени. Сообщество отдаётся отрицательным. */
export async function resolveOwnerId(screenName: string, token: string): Promise<number | null> {
  const res = await call<{ type?: string; object_id?: number }>(
    'utils.resolveScreenName',
    { screen_name: screenName },
    token,
  )
  if (!res || !res.object_id) return null
  if (res.type === 'group' || res.type === 'page' || res.type === 'event') return -res.object_id
  if (res.type === 'user') return res.object_id
  return null
}

export async function wallGet(
  ownerId: number,
  count: number,
  token: string,
): Promise<VkWallResponse> {
  return call<VkWallResponse>('wall.get', { owner_id: ownerId, count, extended: 0 }, token)
}

// Лимит VK для сервисного токена — 3 запроса в секунду. Учреждений в районе
// три десятка, и без паузы синхронизация упирается в «Too many requests» уже на
// первом десятке: ошибка возвращается вместо стены и выглядит как пустая группа.
export const VK_RATE_LIMIT_MS = 400
