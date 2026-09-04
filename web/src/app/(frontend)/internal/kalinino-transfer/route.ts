import config from '@payload-config'
import { getPayload } from 'payload'

import { guardInternal } from '../../../../lib/internal/auth'
import { acquireInternalLock, busyResponse, isBusy } from '../../../../lib/internal/lock'
import { isSafeHandoverDir } from '../../../../lib/kalinino/handover'
import { transferKalinino } from '../../../../lib/kalinino/transfer'

// Перенос записей Калинино из выгрузки на боксе (D-074).
//
// Живёт рядом с остальными `/internal/*` по той же причине: на прод едет
// standalone-бандл без payload CLI, а писать надо в прод-БД и в каталог Media.
// Охрана и замок общие — операция пишет те же документы, что и импорт.
//
// Каталог выгрузки приходит параметром `?dir=` (абсолютный путь строгой формы):
// в репозитории серверные пути не хранятся (D-038), а вычисляет его воркфлоу на
// самом боксе по маске. `?dry=1` печатает план и коллизии, ничего не меняя;
// боевой прогон при коллизиях не начинается — маршрут отвечает 409.

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(request: Request): Promise<Response> {
  const denied = guardInternal(request, 'перенос записей Калинино')
  if (denied) return denied.response

  const params = new URL(request.url).searchParams
  const dir = params.get('dir') ?? ''
  if (!isSafeHandoverDir(dir)) {
    return Response.json({ error: 'dir: нужен абсолютный путь из букв, цифр, точек, дефисов' }, { status: 400 })
  }
  const dryRun = params.get('dry') === '1'

  const lock = acquireInternalLock('перенос записей Калинино')
  if (isBusy(lock)) return busyResponse(lock)

  try {
    const payload = await getPayload({ config })
    const summary = await transferKalinino(payload, {
      dir,
      dryRun,
      log: (message) => payload.logger.info(`[kalinino-transfer] ${message}`),
    })
    // Заблокированный боевой прогон — 409: это отказ по данным, а не успех и не
    // авария. Сухой прогон с коллизиями отвечает 200 — его дело их показать.
    const status = summary.blocked && !dryRun ? 409 : 200
    return Response.json(summary, { status })
  } catch (err) {
    console.error(`[kalinino-transfer] прогон не завершился: ${(err as Error)?.message ?? err}`)
    return Response.json({ error: 'прогон не завершился' }, { status: 500 })
  } finally {
    lock.release()
  }
}
