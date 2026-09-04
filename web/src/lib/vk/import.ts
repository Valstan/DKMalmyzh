import type { getPayload } from 'payload'

import type { VkWallItem } from './api'
import { isImportable, itemText, photoUrls } from './photos'
import { vkTextToLexical, vkTitleFrom } from './toLexical'

// Ядро импорта: превращение записей стены в документы Posts. Вынесено из
// scripts/vk-sync.ts отдельным модулем ровно затем, чтобы гейт мог прогнать его
// на подставных записях — без токена, без сети и без живого сообщества.
// Идемпотентность иначе проверить нечем, а она здесь главное свойство.

type Payload = Awaited<ReturnType<typeof getPayload>>

export type ImportStats = { created: number; skipped: number; failed: number }

export type ImportParams = {
  institutionId: number
  ownerId: number
  label: string
  items: VkWallItem[]
  publish: boolean
  /** Предел числа фото на запись; остальные отбрасываются. */
  photoLimit?: number
  onProblem?: (message: string) => void
}

/** Дедлайн скачивания одного фото. */
const PHOTO_TIMEOUT_MS = Number(process.env.VK_PHOTO_TIMEOUT_MS || 20000)

export async function importWallItems(
  payload: Payload,
  { institutionId, ownerId, label, items, publish, photoLimit = 10, onProblem }: ImportParams,
): Promise<ImportStats> {
  const stats: ImportStats = { created: 0, skipped: 0, failed: 0 }

  // Со стены записи приходят от новых к старым; разворачиваем, чтобы порядок
  // создания совпадал с хронологией — так id в админке растут вместе с датами.
  for (const item of [...items].reverse()) {
    if (!isImportable(item)) continue

    const vkUid = `${ownerId}_${item.id}`

    // Проверка запросом к БД, а не сравнением заголовков: заголовок редактор
    // правит руками, и по нему уже импортированная запись выглядела бы новой.
    const existing = await payload.find({
      collection: 'posts',
      where: { vkUid: { equals: vkUid } },
      depth: 0,
      limit: 1,
    })
    if (existing.totalDocs > 0) {
      stats.skipped += 1
      continue
    }

    try {
      const text = itemText(item)
      const date = item.date ? new Date(item.date * 1000).toISOString() : new Date().toISOString()

      const media: number[] = []
      for (const url of photoUrls(item, photoLimit)) {
        const id = await uploadPhoto(payload, url, label, onProblem)
        if (id !== null) media.push(id)
      }

      await payload.create({
        collection: 'posts',
        // Черновик на сайте не виден, а хук ревалидации сбрасывает четыре пути,
        // включая ВСЕ страницы динамических маршрутов. Сотня черновиков за
        // прогон давала четыреста сбросов кэша впустую, на боксе с одним vCPU и
        // одновременной обработкой картинок. Опубликованное ревалидируем.
        context: { disableRevalidate: !publish },
        data: {
          title: vkTitleFrom(text, `${label}: запись от ${date.slice(0, 10)}`),
          // Slug задаётся явно и несёт vkUid. Автослуг считается из заголовка, а
          // заголовки импорта повторяются по построению: два фотоальбома без
          // текста в один день дают буквально одинаковую строку, репост одной
          // афиши двумя ДК — тоже. Одинаковый slug означает, что /news/<slug>
          // отдаёт только одну запись, а остальные недоступны при живых ссылках
          // из ленты. Уникальность vkUid гарантирует уникальность slug.
          slug: vkSlug(text, vkUid, date),
          date,
          institution: institutionId,
          // Вид записи ставит редактор — импорт не угадывает (решение владельца).
          type: 'news',
          source: 'vk',
          vkUid,
          content: vkTextToLexical(text),
          cover: media[0] ?? undefined,
          gallery: media.slice(1).map((image) => ({ image })),
          _status: publish ? 'published' : 'draft',
        },
      })
      stats.created += 1
    } catch (err) {
      onProblem?.(`запись ${vkUid}: не импортирована — ${describeError(err)}`)
      stats.failed += 1
    }
  }

  return stats
}

// Картинка кладётся через payload.create с готовым буфером — тем же путём, что
// и загрузка из админки: Media сам считает размеры и делает превью.
// Slug записи из ВК: читаемая часть заголовка плюс идентификатор записи. Без
// хвоста два разных материала с одинаковым заголовком схлопнулись бы в один
// адрес — поле `slug` не уникально на уровне схемы, а страница ищет по нему
// первый попавшийся документ.
export function vkSlug(text: string, vkUid: string, dateIso: string): string {
  const head = vkTitleFrom(text, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
    .replace(/-$/, '')
  const tail = vkUid.replace(/[^0-9]+/g, '-').replace(/^-|-$/g, '')
  return head ? `${head}-${tail}` : `zapis-${dateIso.slice(0, 10)}-${tail}`
}

export async function uploadPhoto(
  payload: Payload,
  url: string,
  alt: string,
  onProblem?: (message: string) => void,
): Promise<number | null> {
  try {
    // Фото качается с CDN ВК: соединение, которое отдало заголовки и замолчало,
    // без дедлайна держало бы прогон до умолчания undici (пять минут на попытку).
    const res = await fetch(url, { signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS) })
    if (!res.ok) {
      onProblem?.(`фото ${url}: HTTP ${res.status}`)
      return null
    }
    const buffer = Buffer.from(await res.arrayBuffer())

    const doc = await payload.create({
      collection: 'media',
      context: { disableRevalidate: true },
      data: { alt },
      file: {
        data: buffer,
        name: photoFileName(url),
        mimetype: res.headers.get('content-type') || 'image/jpeg',
        size: buffer.length,
      },
    })
    return doc.id as number
  } catch (err) {
    onProblem?.(`фото ${url}: ${describeError(err)}`)
    return null
  }
}

// Имя файла из адреса ВК; у него всегда есть querystring с подписью, которая в
// имя попасть не должна. Совсем невнятный адрес даёт запасное имя — Media без
// расширения не примет файл.
function photoFileName(url: string): string {
  try {
    const name = new URL(url).pathname.split('/').pop()
    if (name && /\.[a-z0-9]{2,5}$/i.test(name)) return name
  } catch {
    /* адрес не разобрался — уходим на запасное имя */
  }
  return 'vk-photo.jpg'
}

export function describeError(err: unknown): string {
  if (!(err instanceof Error)) return 'неизвестная ошибка'
  return scrubPaths(err.message)
}

// Сообщения об ошибках уходят в summary.messages, оттуда — в тело ответа
// маршрута, а его целиком печатает воркфлоу ручного запуска в ПУБЛИЧНЫЙ лог.
// Сообщение системной ошибки записи файла несёт абсолютный путь на боксе
// (`ENOSPC: no space left on device, open '<путь>/<файл>.jpg'`), а серверные
// пути в публичном логе запрещены (D-038). Режем по форме: класс ошибки нужен,
// путь — нет.
function scrubPaths(message: string): string {
  return (
    message
      // Путь в кавычках — форма, в которой его печатает Node: open '/a/b/c.jpg'.
      // Две отдельные регулярки вместо обратной ссылки: выражение читается как
      // есть и не зависит от того, какой парсер его по дороге переписал.
      .replace(/'\/[^']*'/g, "'<путь>'")
      .replace(/"\/[^"]*"/g, '"<путь>"')
      // И без кавычек, по началу абсолютного пути.
      .replace(/\/(?:home|etc|var|opt|usr|tmp|srv|mnt)\/\S*/g, '<путь>')
  )
}

