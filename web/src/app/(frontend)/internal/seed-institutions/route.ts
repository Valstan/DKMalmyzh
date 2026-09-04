import config from '@payload-config'
import { getPayload } from 'payload'

import { guardInternal } from '../../../../lib/internal/auth'
import { acquireInternalLock, busyResponse, isBusy } from '../../../../lib/internal/lock'
import { seedInstitutions } from '../../../../lib/institutions/seed'

// Заведение каталога домов культуры района изнутри работающего приложения.
//
// Нужен потому же, почему и /internal/vk-sync: на прод едет standalone-бандл,
// payload CLI в него не входит, а писать надо в прод-БД. Дёргается разово —
// воркфлоу `internal-run.yml` по SSH с бокса, — а не по таймеру: каталог
// заводится один раз и потом обновляется, когда меняется справочник.
//
// Идемпотентен: повторный вызов обновляет карточки, а не плодит дубли, и не
// трогает то, что написал редактор.

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(request: Request): Promise<Response> {
  const denied = guardInternal(request, 'заведение каталога')
  if (denied) return denied.response

  // Замок общий с импортом: обе операции пишут institutions.vkSources, и сид,
  // положив ownerId из своего устаревшего чтения, стёр бы кэш, только что
  // записанный импортом. Берётся синхронно, до первого await.
  const lock = acquireInternalLock('заведение каталога')
  if (isBusy(lock)) return busyResponse(lock)

  try {
    const payload = await getPayload({ config })
    const summary = await seedInstitutions(payload)
    payload.logger.info(
      `[seed-institutions] создано ${summary.created}, обновлено ${summary.updated} ` +
        `из ${summary.total}`,
    )
    return Response.json({ ok: true, ...summary })
  } catch (err) {
    console.error(`[seed-institutions] прогон не завершился: ${(err as Error)?.message ?? err}`)
    return Response.json({ error: 'прогон не завершился' }, { status: 500 })
  } finally {
    lock.release()
  }
}
