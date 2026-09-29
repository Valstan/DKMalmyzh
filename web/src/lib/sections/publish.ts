import type { Payload } from 'payload'

// Публикация раздела учреждения: карточка + свежие записи.
//
// Черновики — политика по умолчанию (импорт кладёт черновики, публикует
// редактор), но открытие раздела — осознанное ручное действие владельца:
// запускается воркфлоу `internal-run.yml`, пишется в прод-БД через служебный
// маршрут `/internal/publish-section`, который дёргает эту функцию.
//
// Что делает: находит учреждение по slug, публикует его карточку (была
// черновиком — иначе раздел отдаёт 404), затем публикует его записи-черновики
// не старше `days` дней по полю `date`. Более старые черновики не трогает —
// это бэклог редактора, а не мусор. Каждая запись после обновления
// перечитывается и сверяется (урок reslug: писать и читать основную запись,
// а не версии).
//
// Идемпотентна: повторный прогон находит всё уже опубликованным и ничего
// не меняет. Сухой прогон (`dry: true`) только считает.

export type PublishSectionOptions = {
  slug: string
  days?: number
  dry?: boolean
  log?: (message: string) => void
}

export type PublishSectionSummary = {
  ok: boolean
  dry: boolean
  slug: string
  institutionFound: boolean
  institutionPublished: boolean
  institutionAlreadyPublished: boolean
  postsPublished: number
  postsAlreadyPublished: number
  postsSkippedOld: number
  failed: number
  messages: string[]
}

type InstitutionRow = { id: number | string; slug?: string | null; _status?: string | null }

type PostRow = {
  id: number | string
  title?: string | null
  date?: string | null
  _status?: string | null
}

export async function publishSection(
  payload: Payload,
  options: PublishSectionOptions,
): Promise<PublishSectionSummary> {
  const { slug, dry = false } = options
  const days = Math.min(Math.max(Math.floor(options.days ?? 10), 1), 90)
  const say = (message: string) => {
    options.log?.(message)
  }
  const summary: PublishSectionSummary = {
    ok: false,
    dry,
    slug,
    institutionFound: false,
    institutionPublished: false,
    institutionAlreadyPublished: false,
    postsPublished: 0,
    postsAlreadyPublished: 0,
    postsSkippedOld: 0,
    failed: 0,
    messages: [],
  }
  const err = (message: string) => {
    summary.failed += 1
    summary.messages.push(message)
    say(message)
  }

  const found = await payload.find({
    collection: 'institutions',
    where: { slug: { equals: slug } },
    depth: 0,
    limit: 1,
  })
  const institution = (found.docs[0] as InstitutionRow | undefined) ?? null
  if (!institution) {
    err(`учреждение «${slug}» не найдено — нечего публиковать`)
    return summary
  }
  summary.institutionFound = true

  const cutoff = new Date(Date.now() - days * 86400000).toISOString()

  const fresh = await payload.find({
    collection: 'posts',
    where: {
      institution: { equals: institution.id },
      date: { greater_than_equal: cutoff },
    },
    depth: 0,
    limit: 1000,
    sort: '-date',
  })
  const freshDocs = fresh.docs as PostRow[]
  const drafts = freshDocs.filter((doc) => doc._status !== 'published')
  summary.postsAlreadyPublished = freshDocs.length - drafts.length

  const oldDrafts = await payload.find({
    collection: 'posts',
    where: {
      institution: { equals: institution.id },
      _status: { equals: 'draft' },
      date: { less_than: cutoff },
    },
    depth: 0,
    limit: 1,
  })
  summary.postsSkippedOld = oldDrafts.totalDocs ?? 0

  if (dry) {
    say(
      `сухой прогон: карточка «${slug}» ${institution._status === 'published' ? 'уже опубликована' : 'черновик — будет опубликована'}, ` +
        `свежих записей моложе ${days} дн.: ${freshDocs.length} (черновиков из них ${drafts.length}), старых черновиков не трогаем: ${summary.postsSkippedOld}`,
    )
    summary.ok = true
    return summary
  }

  if (institution._status === 'published') {
    summary.institutionAlreadyPublished = true
  } else {
    try {
      await payload.update({
        collection: 'institutions',
        id: institution.id,
        data: { _status: 'published' },
      })
      const card = (await payload.findByID({
        collection: 'institutions',
        id: institution.id,
        depth: 0,
      })) as InstitutionRow
      if (card._status === 'published') {
        summary.institutionPublished = true
        say('карточка учреждения опубликована — раздел открыт')
      } else {
        err('карточка учреждения НЕ опубликовалась (статус после записи не published)')
      }
    } catch (e) {
      err(`карточка учреждения не записалась: ${(e as Error)?.message ?? e}`)
    }
  }

  for (const doc of drafts) {
    try {
      await payload.update({
        collection: 'posts',
        id: doc.id,
        data: { _status: 'published' },
      })
      const check = (await payload.findByID({
        collection: 'posts',
        id: doc.id,
        depth: 0,
      })) as PostRow
      if (check?._status === 'published') {
        summary.postsPublished += 1
      } else {
        err(`запись «${doc.title ?? doc.id}»: статус после записи не published`)
      }
    } catch (e) {
      err(`запись «${doc.title ?? doc.id}» не опубликовалась: ${(e as Error)?.message ?? e}`)
    }
  }

  say(
    `итог: карточка ${summary.institutionPublished ? 'опубликована' : summary.institutionAlreadyPublished ? 'уже была опубликована' : 'НЕ опубликована'}, ` +
      `записей опубликовано ${summary.postsPublished}, уже было ${summary.postsAlreadyPublished}, старых черновиков пропущено ${summary.postsSkippedOld}, с ошибкой ${summary.failed}`,
  )
  summary.ok = summary.failed === 0
  return summary
}
