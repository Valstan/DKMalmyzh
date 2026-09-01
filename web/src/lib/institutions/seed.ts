import type { getPayload } from 'payload'

import { INSTITUTIONS } from './catalog'

// Заведение каталога домов культуры района. Живёт в src/lib, а не в scripts/,
// по той же причине, что и синхронизация с ВК: на прод едет standalone-бандл
// без payload CLI, поэтому на боксе это исполняет само приложение через
// служебный маршрут. Скрипт в scripts/ — тонкая обёртка для локального запуска.

type Payload = Awaited<ReturnType<typeof getPayload>>

export type SeedSummary = {
  created: number
  updated: number
  total: number
  withVk: number
  /** Карточки, требующие решения человека: две страницы ВК, личный профиль и т.п. */
  needsReview: { title: string; note: string }[]
}

/**
 * Идемпотентно: существующие карточки узнаются по slug и ОБНОВЛЯЮТСЯ.
 *
 * Обновляются только поля справочника (название, населённый пункт, ссылка на
 * сообщество, признак головного). Описание, текст раздела, адрес, телефон и
 * статус публикации не трогаются НИКОГДА: их пишет редактор, и перезапись
 * затирала бы работу руками при каждом повторном прогоне.
 *
 * Новые карточки создаются ЧЕРНОВИКАМИ. Перечень собран машиной по открытым
 * источникам, и часть строк требует человеческого решения — публиковать такое
 * на портале района не глядя нельзя.
 */
export async function seedInstitutions(payload: Payload): Promise<SeedSummary> {
  let created = 0
  let updated = 0

  for (const item of INSTITUTIONS) {
    const existing = await payload.find({
      collection: 'institutions',
      where: { slug: { equals: item.slug } },
      depth: 0,
      limit: 1,
      draft: true,
    })

    // Заметки сборщика сюда НЕ попадают: `description` — публичное поле, и
    // пометка «у этого ДК две страницы ВК» читалась бы на портале как часть
    // описания учреждения. Они уходят в needsReview.
    const data = {
      title: item.title,
      shortTitle: item.shortTitle,
      settlement: item.settlement,
      slug: item.slug,
      vkGroupUrl: item.vkGroupUrl,
      isHead: Boolean(item.isHead),
    }

    if (existing.docs[0]) {
      await payload.update({
        collection: 'institutions',
        id: existing.docs[0].id,
        context: { disableRevalidate: true },
        data,
      })
      updated += 1
    } else {
      await payload.create({
        collection: 'institutions',
        context: { disableRevalidate: true },
        data: { ...data, _status: 'draft' },
      })
      created += 1
    }
  }

  return {
    created,
    updated,
    total: INSTITUTIONS.length,
    withVk: INSTITUTIONS.filter((i) => i.vkGroupUrl).length,
    needsReview: INSTITUTIONS.filter((i) => i.note).map((i) => ({
      title: i.shortTitle,
      note: i.note as string,
    })),
  }
}
