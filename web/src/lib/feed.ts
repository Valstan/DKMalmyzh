import config from '@payload-config'
import { getPayload } from 'payload'
import type { Where } from 'payload'

import { feedWhere, toFeedCard, type FeedPage, type FeedType } from './feedShape'

// Сбор страницы ленты: главная, `/news` и раздел дома культуры.
//
// Почему своя функция, а не публичный REST Payload: браузеру нужны семь полей
// записи и четыре поля дома культуры, а REST отдаёт вместе с ними текст записи
// и текст карточки (вложенный select связи Payload не режет — проверено на
// проде). На единственном vCPU разница в весе ответа — это разница в скорости.
//
// Чистая часть (разбор запроса, обрезка карточки, условие выборки) — в
// `feedShape.ts`, её проверяют юниты без БД.

export type { FeedCard, FeedMediaSize, FeedPage, FeedType } from './feedShape'
export { FEED_MAX_PAGE_SIZE, FEED_PAGE_SIZE } from './feedShape'

type FeedQuery = {
  page?: number
  limit?: number
  institutionSlug?: string | null
  type?: FeedType | null
}

export async function getFeedPage(query: FeedQuery = {}): Promise<FeedPage> {
  const page = Math.min(Math.max(query.page ?? 1, 1), 100000)
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 50)

  const payload = await getPayload({ config })
  let institutionId: string | number | null | undefined
  const slug = query.institutionSlug?.trim()
  if (slug) {
    // Раздел черновика не отдаёт ленту: догружать «невидимое» нельзя, а слаг
    // неизвестного дома культуры — обычный запрос, не ошибка.
    const found = await payload.find({
      collection: 'institutions',
      where: { slug: { equals: slug }, _status: { equals: 'published' } },
      depth: 0,
      limit: 1,
    })
    institutionId = (found.docs[0]?.id as string | number | undefined) ?? null
  }

  const res = await payload.find({
    collection: 'posts',
    // `feedWhere` собирает те же объекты, что принимает `Where`, но держит их в
    // своём типе, чтобы не тянуть типы Payload в юниты.
    where: feedWhere(institutionId, query.type ?? null) as Where,
    sort: '-date',
    depth: 1,
    limit,
    page,
  })

  const totalPages = typeof res.totalPages === 'number' ? res.totalPages : page
  return {
    docs: res.docs.map(toFeedCard),
    page,
    totalPages,
    totalDocs: typeof res.totalDocs === 'number' ? res.totalDocs : res.docs.length,
    hasMore: page < totalPages,
  }
}
