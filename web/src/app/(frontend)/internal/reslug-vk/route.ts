import config from '@payload-config'
import { getPayload } from 'payload'

import { guardInternal } from '../../../../lib/internal/auth'
import { acquireInternalLock, busyResponse, isBusy } from '../../../../lib/internal/lock'
import { reslugVkPosts } from '../../../../lib/vk/reslug'

// Разовая операция: привести адреса импортированных записей к уникальным.
//
// Живёт рядом с остальными `/internal/*` по той же причине: на прод едет
// standalone-бандл без payload CLI, а писать надо в прод-БД. Охрана и замок
// общие — операция пишет те же документы, что и импорт.
//
// `?dry=1` печатает план и ничего не меняет. На проде сначала прогоняется он.

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(request: Request): Promise<Response> {
  const denied = guardInternal(request, 'переименование адресов записей')
  if (denied) return denied.response

  const lock = acquireInternalLock('переименование адресов записей')
  if (isBusy(lock)) return busyResponse(lock)

  try {
    const payload = await getPayload({ config })
    const dryRun = new URL(request.url).searchParams.get('dry') === '1'
    const summary = await reslugVkPosts(payload, {
      dryRun,
      log: (message) => payload.logger.info(`[reslug-vk] ${message}`),
    })
    return Response.json({ ok: true, dryRun, ...summary })
  } catch (err) {
    console.error(`[reslug-vk] прогон не завершился: ${(err as Error)?.message ?? err}`)
    return Response.json({ error: 'прогон не завершился' }, { status: 500 })
  } finally {
    lock.release()
  }
}
