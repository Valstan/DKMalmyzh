import { timingSafeEqual } from 'node:crypto'

import { slugForVkPost } from './vk/import'
import { vkTextToLexical, vkTitleFrom } from './vk/toLexical'

// Чистая логика приёмника стандартного эшелона доставки (мандат Мозга 29.09,
// заказ владельца: Сарафан сам доставляет посты и в ДК). Вынесена из
// `app/api/ingest/posts/route.ts`, чтобы проверяться юнитами без БД и HTTP —
// калька с приёмников портала, Сабантуя и Казанской: контракт один, чтобы
// Сарафан включал сайт строкой в конфиге, а не отдельным кодом.
//
// Отличия от соседей — только в форме нашей коллекции `posts`:
//   - рубрики-коллекции нет; `section` от классификатора — это slug учреждения
//     (чей материал), неизвестный slug — warning + сохраняется в текстовое поле
//     `category`, чтобы редактор видел догадку классификатора;
//   - вид записи ставит редактор (`type: 'news'` молча, импорт не угадывает);
//   - ключа публикации нет вовсе (мандат: «ключа публикации не просим») —
//     `publish: true` всегда игнорируется с warning, всё едет черновиками.

export type LexicalDoc = ReturnType<typeof vkTextToLexical>

export type IncomingImage = string | { url: string; alt?: string }
export type IncomingVideo = string | { url: string; title?: string }

export const MAX_IMAGES = 10
export const MAX_VIDEOS = 5

// Сравнение секрета из заголовка с ожидаемым — постоянное время, как и у
// служебных маршрутов. Пустой env — «никого не пускать», а не «пускать всех».
export function secretMatches(given: string, expected: string | undefined): boolean {
  if (!expected) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

// Ключ приходит либо своим заголовком, либо Bearer — принимаем оба имени,
// как у портала и Казанской: Сарафан шлёт одинаково всем трём приёмникам.
export function extractGatewayKey(request: Request): string {
  return (
    request.headers.get('x-gateway-key') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    ''
  )
}

// Заголовок записи. Явного нет — первая осмысленная строка текста (≤90, по
// границе слова); совсем пустой текст даёт запасной заголовок с датой, чтобы
// пост из одних фото не выглядел потерянным в админке.
export function deriveTitle(rawTitle: string, text: string, fallbackDateIso: string): string {
  if (rawTitle) return rawTitle
  return vkTitleFrom(text, `Запись от ${fallbackDateIso.slice(0, 10)}`)
}

// Дата оригинала. Нет или не разбирается — warning и время доставки: лента
// сортируется по этому полю, и «когда-то» хуже честного «сейчас».
export function resolveDate(raw: unknown, nowIso: string, warnings: string[]): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    warnings.push('date missing: set to delivery time')
    return nowIso
  }
  const parsed = new Date(raw.trim())
  if (Number.isNaN(parsed.getTime())) {
    warnings.push(`date invalid: ${raw.trim().slice(0, 40)} — set to delivery time`)
    return nowIso
  }
  return parsed.toISOString()
}

// Видео не перекладываем — только ссылка (плеер ВК встраивается на странице,
// тяжёлых файлов у нас нет, решение то же, что у портала).
export function normalizeVideos(raw: unknown, warnings: string[]): { url: string; title?: string }[] {
  if (!Array.isArray(raw)) return []
  const videos: { url: string; title?: string }[] = []
  for (const [index, item] of (raw as IncomingVideo[]).entries()) {
    if (videos.length >= MAX_VIDEOS) {
      warnings.push(`videos truncated to ${MAX_VIDEOS}`)
      break
    }
    const url = typeof item === 'string' ? item : item?.url
    if (!url || !/^https?:\/\//i.test(url)) {
      warnings.push(`video ${index}: invalid url`)
      continue
    }
    videos.push({ url, title: typeof item === 'object' ? item?.title : undefined })
  }
  return videos
}

export type PostDataInput = {
  title: string
  text: string
  vkUid: string
  sourceUrl: string
  dateIso: string
  institutionId?: number
  /** Догадка классификатора, не matched на учреждение — сохраняем как метку. */
  category?: string
  mediaIds: number[]
  videos: { url: string; title?: string }[]
}

// Тело документа коллекции `posts` для payload.create/update.
//
// ⚠️ `_status: 'draft'` — явно, не флагом `draft`: при versions.drafts состояние
// берётся отсюда, `draft: false` не публикует (G223). Slug несёт vkUid —
// заголовки доставки повторяются по построению, без хвоста разные материалы
// схлопнулись бы в один адрес (#279 у переноса Калинино).
export function buildPostData(input: PostDataInput) {
  return {
    _status: 'draft' as const,
    title: input.title,
    slug: slugForVkPost(input.title, input.vkUid, input.dateIso),
    date: input.dateIso,
    institution: input.institutionId ?? undefined,
    type: 'news' as const,
    source: 'vk' as const,
    vkUid: input.vkUid,
    sourceUrl: input.sourceUrl,
    content: vkTextToLexical(input.text),
    cover: input.mediaIds[0] ?? undefined,
    gallery: input.mediaIds.slice(1).map((image) => ({ image })),
    videos: input.videos.length
      ? input.videos.map((v) => ({ url: v.url, title: v.title || undefined }))
      : undefined,
    category: input.category || undefined,
  }
}
