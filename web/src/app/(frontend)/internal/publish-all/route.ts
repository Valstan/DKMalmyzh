import config from '@payload-config'
import { getPayload } from 'payload'

import { guardInternal } from '../../../../lib/internal/auth'
import { acquireInternalLock, busyResponse, isBusy } from '../../../../lib/internal/lock'
import { publishAll } from '../../../../lib/sections/publishAll'

// Разовая операция: опубликовать ВСЁ накопленное — карточки учреждений и записи
// (заказ владельца 30.09).
//
// Живёт служебным маршрутом по той же причине, что остальные `/internal/*`: на
// прод едет standalone-бандл без payload CLI, а писать надо в прод-БД.
// Охрана и общий замок — те же.
//
// `?dry=1` — только план: сколько карточек и записей, раскладка по домам,
// непристроенные и помеченные «не публиковать». На проде сначала гоняется он,
// владельцу глазами — и только потом боевой.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(request: Request): Promise<Response> {
  const denied = guardInternal(request, 'массовая публикация черновиков')
  if (denied) return denied.response

  const lock = acquireInternalLock('массовая публикация черновиков')
  if (isBusy(lock)) return busyResponse(lock)

  try {
    const payload = await getPayload({ config })
    const dry = new URL(request.url).searchParams.get('dry') === '1'
    const summary = await publishAll(payload, {
      dry,
      log: (message) => payload.logger.info(`[publish-all] ${message}`),
    })
    return Response.json(summary, { status: summary.ok ? 200 : 500 })
  } catch (err) {
    console.error(`[publish-all] прогон не завершился: ${(err as Error)?.message ?? err}`)
    return Response.json({ error: 'прогон не завершился' }, { status: 500 })
  } finally {
    lock.release()
  }
}
