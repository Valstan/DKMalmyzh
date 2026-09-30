import config from '@payload-config'
import { getPayload } from 'payload'

import { guardInternal } from '../../../../lib/internal/auth'
import { acquireInternalLock, busyResponse, isBusy } from '../../../../lib/internal/lock'
import { seedHeaderNav } from '../../../../lib/chrome/seedNav'

// Разовая операция: привести меню в шапке в порядок — добавить недостающие
// стандартные пункты (заказ владельца 30.09: пункт «Праздники района» в меню).
//
// Живёт служебным маршрутом по общей причине: на прод едет standalone-бандл без
// payload CLI, а писать надо в прод-БД. Охрана и общий замок — те же.
//
// Операция не переписывает шапку, а дописывает недостающее: то, что владелец
// поправил руками (подписи, порядок, название), остаётся как есть.
// `?dry=1` — только показать, что добавится.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(request: Request): Promise<Response> {
  const denied = guardInternal(request, 'меню в шапке')
  if (denied) return denied.response

  const lock = acquireInternalLock('меню в шапке')
  if (isBusy(lock)) return busyResponse(lock)

  try {
    const payload = await getPayload({ config })
    const dry = new URL(request.url).searchParams.get('dry') === '1'
    const summary = await seedHeaderNav(payload, {
      dry,
      log: (message) => payload.logger.info(`[seed-nav] ${message}`),
    })
    return Response.json(summary, { status: summary.ok ? 200 : 500 })
  } catch (err) {
    console.error(`[seed-nav] прогон не завершился: ${(err as Error)?.message ?? err}`)
    return Response.json({ error: 'прогон не завершился' }, { status: 500 })
  } finally {
    lock.release()
  }
}
