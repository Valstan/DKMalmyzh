import type { Payload } from 'payload'

import { slugForVkPost } from './import'

// Приведение адресов импортированных записей к уникальным.
//
// Зачем разовая операция, а не только правка импорта: 636 записей приехали на
// прод до того, как slug стал нести vkUid. Проба показала 49 совпадающих адресов
// на 123 записи — то есть при публикации 74 материала оказались бы недоступны:
// поле `slug` не уникально в схеме, а страница записи ищет по нему первый
// попавшийся документ и отдаёт его, пока ссылки в ленте ведут на всех.
//
// Свойства операции:
//  - идемпотентна: адрес считается тем же кодом, что и при импорте, поэтому
//    повторный прогон ничего не меняет и печатает «переименовано 0»;
//  - трогает только записи из ВК (`source: 'vk'`) с известным `vkUid` — то, что
//    редактор написал руками, не наш материал;
//  - не публикует и не снимает с публикации: статус документа не участвует.

export type ReslugSummary = {
  scanned: number
  renamed: number
  skipped: number
  failed: number
  messages: string[]
}

type PostRow = {
  id: number | string
  title?: string | null
  slug?: string | null
  vkUid?: string | null
  date?: string | null
  publishedAt?: string | null
  _status?: string | null
}

export async function reslugVkPosts(
  payload: Payload,
  options: { dryRun?: boolean; log?: (message: string) => void } = {},
): Promise<ReslugSummary> {
  const { dryRun = false, log } = options
  const summary: ReslugSummary = { scanned: 0, renamed: 0, skipped: 0, failed: 0, messages: [] }

  const say = (message: string) => {
    summary.messages.push(message)
    log?.(message)
  }

  // Черновики тоже нужны — на проде сейчас все записи черновики, и именно их
  // адреса и надо развести до публикации.
  const found = await payload.find({
    collection: 'posts',
    where: { source: { equals: 'vk' } },
    depth: 0,
    limit: 0,
    pagination: false,
    draft: true,
  })

  const rows = found.docs as PostRow[]
  // Занятые адреса: и у записей ВК, и у всего остального — на них тоже нельзя
  // наехать. Считаем по факту, а не по вере в уникальность нового алгоритма.
  const taken = new Set<string>()
  const all = await payload.find({
    collection: 'posts',
    depth: 0,
    limit: 0,
    pagination: false,
    draft: true,
  })
  for (const doc of all.docs as PostRow[]) {
    if (typeof doc.slug === 'string' && doc.slug) taken.add(doc.slug)
  }

  for (const row of rows) {
    summary.scanned += 1
    const vkUid = typeof row.vkUid === 'string' ? row.vkUid : ''
    if (!vkUid) {
      summary.skipped += 1
      continue
    }

    const dateIso = row.date || row.publishedAt || new Date(0).toISOString()
    const wanted = slugForVkPost(row.title || '', vkUid, dateIso)

    if (row.slug === wanted) {
      summary.skipped += 1
      continue
    }

    // Крайний случай: нужный адрес уже занят ЧУЖИМ документом (например, запись
    // завели вручную с таким же slug). Тогда не трогаем — молча наезжать на
    // чужой адрес хуже, чем оставить дубль и назвать его в отчёте.
    if (taken.has(wanted) && row.slug !== wanted) {
      summary.failed += 1
      say(`запись ${vkUid}: адрес «${wanted}» уже занят — оставлено как есть`)
      continue
    }

    if (dryRun) {
      summary.renamed += 1
      say(`${vkUid}: «${row.slug ?? '—'}» -> «${wanted}»`)
      taken.add(wanted)
      continue
    }

    try {
      // Обновляем ОСНОВНУЮ запись, без `draft: true`.
      //
      // С `draft: true` правка ложится в версию (`_posts_v`), а колонка
      // `posts.slug` остаётся прежней — операция рапортует «переименовано 636»,
      // а дубли в базе никуда не деваются. Поймано ровно так: отчёт зелёный,
      // проба прода показала те же 49 совпадений. Публикацию это не включает:
      // состояние берётся из `data._status`, которого мы не передаём (G223).
      await payload.update({
        collection: 'posts',
        id: row.id,
        context: { disableRevalidate: row._status !== 'published' },
        data: { slug: wanted },
      })

      // Приёмка по факту, а не по отсутствию исключения: перечитываем документ и
      // сверяем адрес. Молчаливое «обновилось не там» — тот же класс, что уже
      // случился выше.
      const check = (await payload.findByID({
        collection: 'posts',
        id: row.id,
        depth: 0,
      })) as PostRow

      if (check?.slug !== wanted) {
        summary.failed += 1
        say(`запись ${vkUid}: адрес не изменился (в базе «${check?.slug ?? '—'}»)`)
        continue
      }

      if (typeof row.slug === 'string' && row.slug) taken.delete(row.slug)
      taken.add(wanted)
      summary.renamed += 1
    } catch (err) {
      summary.failed += 1
      say(`запись ${vkUid}: не переименована — ${(err as Error)?.message ?? 'ошибка'}`)
    }
  }

  say(
    `итог: просмотрено ${summary.scanned}, переименовано ${summary.renamed}, ` +
      `без изменений ${summary.skipped}, с ошибкой ${summary.failed}`,
  )

  return summary
}
