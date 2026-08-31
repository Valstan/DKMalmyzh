import type { VkWallItem, VkPhotoSize } from './api'

// Выбор картинок из записи. Отдельный модуль, потому что логика неочевидна и
// проверяется тестами: у ВК размеры приходят массивом без гарантий порядка, а
// у репоста вложения лежат этажом ниже.

const AREA = (s: VkPhotoSize): number => (s.width ?? 0) * (s.height ?? 0)

/** Самый крупный вариант фото. Порядок sizes в ответе не гарантирован — берём по площади. */
export function largestSize(sizes: VkPhotoSize[] | undefined): VkPhotoSize | null {
  if (!Array.isArray(sizes) || sizes.length === 0) return null
  return sizes.reduce((best, s) => (AREA(s) > AREA(best) ? s : best), sizes[0])
}

/**
 * URL всех фото записи, в порядке появления. Репост (copy_history) разбирается
 * тоже: сельские ДК часто именно репостят афишу района, и без этого запись
 * приезжала бы пустой — с текстом «» и без картинок.
 */
export function photoUrls(item: VkWallItem, limit = 10): string[] {
  const sources: VkWallItem[] = [item, ...(item.copy_history ?? [])]
  const urls: string[] = []

  for (const source of sources) {
    for (const att of source.attachments ?? []) {
      if (att.type !== 'photo' || !att.photo) continue
      const size = largestSize(att.photo.sizes)
      if (size?.url) urls.push(size.url)
      if (urls.length >= limit) return urls
    }
  }
  return urls
}

/** Текст записи; у репоста без своего текста берётся текст оригинала. */
export function itemText(item: VkWallItem): string {
  const own = (item.text ?? '').trim()
  if (own) return own
  for (const copy of item.copy_history ?? []) {
    const copied = (copy.text ?? '').trim()
    if (copied) return copied
  }
  return ''
}

/**
 * Запись стоит импортировать? Реклама и закреп отбрасываются: закреплённая
 * запись висит годами и на каждой синхронизации лезла бы наверх ленты как новая.
 */
export function isImportable(item: VkWallItem): boolean {
  if (item.marked_as_ads) return false
  if (item.is_pinned) return false
  return Boolean(item.id)
}
