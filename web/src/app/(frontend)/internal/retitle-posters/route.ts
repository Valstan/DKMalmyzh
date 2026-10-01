import config from '@payload-config'
import { getPayload } from 'payload'

import { guardInternal } from '../../../../lib/internal/auth'
import { acquireInternalLock, busyResponse, isBusy } from '../../../../lib/internal/lock'
import { retitlePosters } from '../../../../lib/posts/posters'

// Разовая операция: афиши и пустые записи без текста (заказ владельца 02.10).
//
// Пост ВК без единого слова текста импорт называет «…запись от <дата>» —
// в ленте такие карточки читаются как копии одна за другой. Правило:
// одно фото без текста — это афиша («Афиша от <дата>», дата оригинала);
// нет ни текста, ни фото, ни видео — удалить; остальное не трогаем.
// Подробности и границы — в `src/lib/posts/posters.ts`.
//
// `?dry=1` — только отчёт: сколько афиш, сколько пустых, образцы. На проде
// сначала гоняется он, и боевой прогон идёт отдельной командой владельца.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(request: Request): Promise<Response> {
  const denied = guardInternal(request, 'переименование афиш и чистка пустых')
  if (denied) return denied.response

  const lock = acquireInternalLock('переименование афиш и чистка пустых')
  if (isBusy(lock)) return busyResponse(lock)

  try {
    const payload = await getPayload({ config })
    const url = new URL(request.url)
    const summary = await retitlePosters(payload, {
      dry: url.searchParams.get('dry') === '1',
      log: (message) => payload.logger.info(`[retitle-posters] ${message}`),
    })
    return Response.json(summary, { status: summary.ok ? 200 : 500 })
  } catch (err) {
    console.error(`[retitle-posters] прогон не завершился: ${(err as Error)?.message ?? err}`)
    return Response.json({ error: 'прогон не завершился' }, { status: 500 })
  } finally {
    lock.release()
  }
}
