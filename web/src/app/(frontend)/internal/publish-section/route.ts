import config from '@payload-config'
import { getPayload } from 'payload'

import { guardInternal } from '../../../../lib/internal/auth'
import { acquireInternalLock, busyResponse, isBusy } from '../../../../lib/internal/lock'
import { publishSection } from '../../../../lib/sections/publish'

// Публикация раздела учреждения изнутри работающего приложения:
// `POST /internal/publish-section?slug=<slug>&days=<N>&dry=1`.
//
// Зачем отдельным маршрутом: импорт (`/internal/vk-sync`) по политике кладёт
// черновики, а публикует редактор в админке. Но открытие целого раздела —
// разовое ручное действие владельца (первый такой — РЦКД, /dk/rckd отдавал 404
// при живом 301 со второго имени): карточка публикуется здесь же, вместе со
// свежими записями, одним прогоном с приёмкой по факту.
//
// Параметры: `slug` обязателен; `days` — возраст записей (по полю `date`),
// по умолчанию 10, потолок 90; `dry=1` — только посчитать, ничего не писать
// (воркфлоу `internal-run.yml` подставляет его сам при dry_run).
// Замок общий с остальными пишущими операциями: параллельно идёт одна.

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(request: Request): Promise<Response> {
  const denied = guardInternal(request, 'публикация раздела')
  if (denied) return denied.response

  // Замок берётся синхронно, до первого await — см. комментарий в
  // `internal/vk-sync/route.ts`, там же история гонки от 04.09.
  const lock = acquireInternalLock('публикация раздела')
  if (isBusy(lock)) return busyResponse(lock)

  try {
    const params = new URL(request.url).searchParams
    const slug = (params.get('slug') || '').trim()
    if (!/^[a-z0-9-]{1,64}$/.test(slug)) {
      return Response.json({ error: 'нужен ?slug= строчными латинскими буквами, цифрами и дефисом' }, { status: 400 })
    }
    const rawDays = (params.get('days') || '').trim()
    if (rawDays !== '' && !/^\d{1,3}$/.test(rawDays)) {
      return Response.json({ error: 'days — число дней 1..90' }, { status: 400 })
    }
    const dry = params.get('dry') === '1'

    const payload = await getPayload({ config })
    const summary = await publishSection(payload, {
      slug,
      days: rawDays === '' ? 10 : Number(rawDays),
      dry,
      log: (message) => payload.logger.info(`[publish-section] ${message}`),
    })
    return Response.json(summary, { status: summary.ok ? 200 : 500 })
  } catch (err) {
    console.error(`[publish-section] прогон не завершился: ${(err as Error)?.message ?? err}`)
    return Response.json({ error: 'прогон не завершился' }, { status: 500 })
  } finally {
    lock.release()
  }
}
