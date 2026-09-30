import config from '@payload-config'
import { getPayload } from 'payload'

import { guardInternal } from '../../../../lib/internal/auth'
import { acquireInternalLock, busyResponse, isBusy } from '../../../../lib/internal/lock'
import { dedupePosts } from '../../../../lib/posts/dedupe'

// Разовая операция: удалить дубли новостей, накопленные двойными прогонами
// импорта (заказ владельца 30.09).
//
// Признак дубля — совпадение заголовка И текста: один материал лежит в двух
// стенах ВК (у РЦКД их две), поэтому идентификаторы и даты у копий разные.
// Подробности и границы — в `src/lib/posts/dedupe.ts`.
//
// `?dry=1` — только отчёт: сколько групп, что и сколько удалится, по каким ДК.
// На проде сначала гоняется он, и удаление идёт отдельной командой владельца.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(request: Request): Promise<Response> {
  const denied = guardInternal(request, 'чистка дублей новостей')
  if (denied) return denied.response

  const lock = acquireInternalLock('чистка дублей новостей')
  if (isBusy(lock)) return busyResponse(lock)

  try {
    const payload = await getPayload({ config })
    const url = new URL(request.url)
    const summary = await dedupePosts(payload, {
      dry: url.searchParams.get('dry') === '1',
      log: (message) => payload.logger.info(`[dedupe-posts] ${message}`),
    })
    return Response.json(summary, { status: summary.ok ? 200 : 500 })
  } catch (err) {
    console.error(`[dedupe-posts] прогон не завершился: ${(err as Error)?.message ?? err}`)
    return Response.json({ error: 'прогон не завершился' }, { status: 500 })
  } finally {
    lock.release()
  }
}
