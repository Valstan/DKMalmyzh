import type { Payload } from 'payload'

import { safeRevalidatePath } from '../safeRevalidate'
import { INSTITUTIONS } from '../institutions/catalog'

// Массовая публикация накопленных черновиков (заказ владельца 30.09):
// все карточки учреждений + все записи — с датой оригинала и раскладкой
// записей по домам культуры.
//
// Живёт служебным маршрутом `/internal/publish-all` (запуск —
// `internal-run.yml`), потому что на прод едет standalone-бандл без payload
// CLI. Сначала всегда гоняется сухой прогон (`?dry=1`): план, раскладка и
// список непристроенных — владельцу глазами, и только потом боевой.
//
// Что делает боевой прогон:
//   1. Публикует ВСЕ карточки-черновики (включая помеченные в справочнике
//      «не публиковать» — Нослы и Дерюшево: решение владельца 30.09 старше
//      пометки 01.09, в отчёте они выделены отдельно).
//   2. Публикует ВСЕ записи-черновики, проставляя `publishedAt` = `date`
//      (дата оригинала в паблике). Нет валидной даты — оставляем как было
//      и считаем в `postsDateFallbackKept`.
//   3. Уже опубликованным записям тоже правит `publishedAt` на дату оригинала,
//      если расходится, — дата публикации везде одинаковая по смыслу.
//   4. Записям без учреждения подбирает дом по релевантности: сначала по
//      владельцу стены (`vkUid` → `ownerId` из `vkSources`), затем по упоминанию
//      населённого пункта в заголовке/тексте. Неоднозначность — не пристраивать,
//      а отдать в отчёт.
//   5. В конце один раз сбрасывает кэш ключевых страниц (записи пишутся с
//      `disableRevalidate`, иначе сотни сбросов положат единственный vCPU).
//
// Идемпотентна: повтор находит всё опубликованным и с датами на месте.

export type PublishAllOptions = {
  dry?: boolean
  log?: (message: string) => void
}

export type UnassignedPost = { id: number; title?: string | null; slug?: string | null }

export type AssignedPreview = { title?: string | null; institution: string; by: 'owner' | 'text' }

export type PublishAllSummary = {
  ok: boolean
  dry: boolean
  institutionsDraft: number
  institutionsPublished: number
  institutionsAlreadyPublished: number
  institutionsFlagged: string[]
  postsDraft: number
  postsPublished: number
  postsBackfilled: number
  postsAssignedByOwner: number
  postsAssignedByText: number
  postsUnassigned: number
  postsDateFallbackKept: number
  postsSkippedNoDate: number
  failed: number
  unassigned: UnassignedPost[]
  assignedPreview: AssignedPreview[]
  messages: string[]
}

type InstitutionRow = {
  id: number
  slug?: string | null
  title?: string | null
  shortTitle?: string | null
  _status?: string | null
  vkSources?: { url?: unknown; ownerId?: unknown }[] | null
}

type PostRow = {
  id: number
  title?: string | null
  slug?: string | null
  text?: unknown
  date?: string | null
  publishedAt?: string | null
  _status?: string | null
  vkUid?: string | null
  category?: string | null
  institution?: number | { id: number } | null
}

// Владелец стены из канонического `owner_post`. Не разобрался — null, и запись
// идёт в непристроенные, а не к случайному дому.
export function parseVkOwner(vkUid: unknown): number | null {
  if (typeof vkUid !== 'string') return null
  const match = /^(-?\d+)_(\d+)$/.exec(vkUid.trim())
  if (!match) return null
  const owner = Number(match[1])
  return Number.isSafeInteger(owner) ? owner : null
}

// Дата публикации: дата оригинала, если валидна. Иначе — что было (не выдумываем
// «сейчас»: сортировка лент идёт по `date`, а `publishedAt` без оригинала
// честнее оставить как есть).
export function resolvePublishDate(
  dateIso: unknown,
  fallbackIso: unknown,
): { iso: string | null; usedFallback: boolean } {
  if (typeof dateIso === 'string' && dateIso.trim()) {
    const parsed = new Date(dateIso.trim())
    if (!Number.isNaN(parsed.getTime())) return { iso: parsed.toISOString(), usedFallback: false }
  }
  if (typeof fallbackIso === 'string' && fallbackIso.trim()) {
    const parsed = new Date(fallbackIso.trim())
    if (!Number.isNaN(parsed.getTime())) return { iso: parsed.toISOString(), usedFallback: true }
  }
  return { iso: null, usedFallback: true }
}

export type MatchCandidate = { id: number; shortTitle?: string | null }

// Упоминание дома культуры в тексте — по короткому названию (населённый пункт
// не берём: «Малмыж» упоминается везде и притянул бы всё к головному).
// Русские падежи не дают искать подстрокой («в Рожках» не содержит «рожки»),
// поэтому сравниваем слова с основой токена: слово начинается на основу длиной
// от 4 букв («рожках» — на «рожк», «Гоньбе» — на «гонь»). Составное название
// требует ВСЕ значимые токены («Большой Китяк» — и «больш», и «кит»: иначе
// каждое «большой» в тексте притягивало бы пост в Китяк).
// Побеждает сильнейшее свидетельство — самый длинный совпавший стем; равных
// нет — не пристраиваем (лучше непристроенная, чем чужая).
export function matchInstitutionByText(
  title: unknown,
  text: unknown,
  candidates: MatchCandidate[],
): number | null {
  const hay = `${typeof title === 'string' ? title : ''}\n${typeof text === 'string' ? text : ''}`.toLowerCase()
  // Дефис — разделитель слов («Тат-Верх-Гоньба» — три слова): иначе составное
  // название никогда не соберётся из токенов.
  const words = hay.match(/[а-яёa-z0-9]+/g) ?? []
  if (words.length === 0) return null
  const tokensOf = (shortTitle: string | null | undefined): string[] =>
    (shortTitle ?? '')
      .toLowerCase()
      .split(/[\s-]+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 4)
  const matched = candidates
    .map((c) => {
      const tokens = tokensOf(c.shortTitle)
      if (tokens.length === 0) return null
      // Самый длинный совпавший стем — мера силы свидетельства: полное
      // «Самотестово» сильнее префикса «Самотест» от соседней карточки.
      let best = 0
      let ok = true
      for (const token of tokens) {
        let tokenBest = 0
        for (let cut = 0; cut <= 2 && token.length - cut >= 4; cut++) {
          const stem = token.slice(0, token.length - cut)
          if (words.some((word) => word.startsWith(stem))) tokenBest = Math.max(tokenBest, stem.length)
        }
        if (tokenBest === 0) {
          ok = false
          break
        }
        best = Math.max(best, tokenBest)
      }
      return ok ? { id: c.id, best } : null
    })
    .filter((m): m is { id: number; best: number } => m !== null)
  if (matched.length === 0) return null
  const top = Math.max(...matched.map((m) => m.best))
  const winners = matched.filter((m) => m.best === top)
  if (winners.length !== 1) return null
  return winners[0].id
}

// Текст записи для матчинга: у richText lexical забираем текстовые узлы.
export function lexicalText(data: unknown): string {
  const out: string[] = []
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    const record = node as Record<string, unknown>
    if (record['type'] === 'text' && typeof record['text'] === 'string') out.push(record['text'])
    const children = record['children']
    if (Array.isArray(children)) children.forEach(walk)
    if (record['root']) walk(record['root'])
  }
  walk(data)
  return out.join('\n')
}

const sameMinute = (a: string, b: string): boolean => Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 60000

export async function publishAll(payload: Payload, options: PublishAllOptions): Promise<PublishAllSummary> {
  const { dry = false } = options
  const say = (message: string) => options.log?.(message)
  const summary: PublishAllSummary = {
    ok: false,
    dry,
    institutionsDraft: 0,
    institutionsPublished: 0,
    institutionsAlreadyPublished: 0,
    institutionsFlagged: [],
    postsDraft: 0,
    postsPublished: 0,
    postsBackfilled: 0,
    postsAssignedByOwner: 0,
    postsAssignedByText: 0,
    postsUnassigned: 0,
    postsDateFallbackKept: 0,
    postsSkippedNoDate: 0,
    failed: 0,
    unassigned: [],
    assignedPreview: [],
    messages: [],
  }
  const err = (message: string) => {
    summary.failed += 1
    summary.messages.push(message)
    say(message)
  }

  // Карточки, помеченные в справочнике заметкой («не публиковать», личные
  // страницы и т.п.), — в отчёт отдельно: решение 30.09 их публикует, но
  // владелец должен видеть, какие именно шли против пометки.
  const notedSlugs = new Set(INSTITUTIONS.filter((i) => i.note).map((i) => i.slug))

  const institutions = (await payload.find({
    collection: 'institutions',
    pagination: false,
    depth: 0,
    limit: 500,
    sort: 'title',
  })) as unknown as { docs: InstitutionRow[] }
  const cards = institutions.docs ?? []
  const publishedCards = cards.filter((c) => c._status === 'published')
  const draftCards = cards.filter((c) => c._status !== 'published')
  summary.institutionsAlreadyPublished = publishedCards.length
  summary.institutionsDraft = draftCards.length
  for (const card of draftCards) {
    if (card.slug && notedSlugs.has(card.slug)) summary.institutionsFlagged.push(card.slug)
  }

  // Карта «владелец стены → дом» по закэшированным ownerId справочника.
  const ownerToInstitution = new Map<number, number>()
  for (const card of cards) {
    for (const source of card.vkSources ?? []) {
      if (typeof source?.ownerId === 'number') ownerToInstitution.set(source.ownerId, card.id)
    }
  }
  const matchCandidates: MatchCandidate[] = cards.map((c) => ({ id: c.id, shortTitle: c.shortTitle }))

  if (dry) {
    say(
      `сухой прогон: карточек черновиков ${draftCards.length} (уже опубликовано ${publishedCards.length}), ` +
        `из них против пометки справочника: ${summary.institutionsFlagged.join(', ') || 'нет'}`,
    )
  } else {
    for (const card of draftCards) {
      try {
        await payload.update({
          collection: 'institutions',
          id: card.id,
          context: { disableRevalidate: true },
          data: { _status: 'published' },
        })
        const check = (await payload.findByID({
          collection: 'institutions',
          id: card.id,
          depth: 0,
        })) as unknown as InstitutionRow
        if (check?._status === 'published') summary.institutionsPublished += 1
        else err(`карточка «${card.title ?? card.slug ?? card.id}» НЕ опубликовалась`)
      } catch (e) {
        err(`карточка «${card.title ?? card.slug ?? card.id}» не записалась: ${(e as Error)?.message ?? e}`)
      }
    }
    say(`карточки: опубликовано ${summary.institutionsPublished}, уже было ${summary.institutionsAlreadyPublished}`)
  }

  const posts = (await payload.find({
    collection: 'posts',
    where: { _status: { equals: 'draft' } },
    pagination: false,
    depth: 0,
    limit: 5000,
  })) as unknown as { docs: PostRow[] }
  const drafts = posts.docs ?? []
  summary.postsDraft = drafts.length

  type PlannedPost = {
    doc: PostRow
    institutionId: number | undefined
    assignedBy: 'owner' | 'text' | null
    publishIso: string | null
    usedFallback: boolean
  }
  const plan: PlannedPost[] = drafts.map((doc) => {
    const current = typeof doc.institution === 'number' ? doc.institution : doc.institution?.id
    let institutionId = current ?? undefined
    let assignedBy: 'owner' | 'text' | null = null
    if (institutionId === undefined) {
      const owner = parseVkOwner(doc.vkUid)
      const byOwner = owner === null ? undefined : ownerToInstitution.get(owner)
      if (byOwner !== undefined) {
        institutionId = byOwner
        assignedBy = 'owner'
      } else {
        const byText = matchInstitutionByText(doc.title ?? '', lexicalText(doc.text), matchCandidates)
        if (byText !== null) {
          institutionId = byText
          assignedBy = 'text'
        }
      }
    }
    const { iso, usedFallback } = resolvePublishDate(doc.date, doc.publishedAt)
    return { doc, institutionId, assignedBy, publishIso: iso, usedFallback }
  })

  for (const item of plan) {
    if (item.assignedBy === 'owner') summary.postsAssignedByOwner += 1
    if (item.assignedBy === 'text') {
      summary.postsAssignedByText += 1
      if (summary.assignedPreview.length < 100) {
        const card = cards.find((c) => c.id === item.institutionId)
        summary.assignedPreview.push({
          title: item.doc.title,
          institution: card?.shortTitle ?? card?.title ?? String(item.institutionId),
          by: 'text',
        })
      }
    }
    if (item.institutionId === undefined) {
      summary.postsUnassigned += 1
      if (summary.unassigned.length < 100) {
        summary.unassigned.push({ id: item.doc.id, title: item.doc.title, slug: item.doc.slug })
      }
    }
    if (item.publishIso === null || item.usedFallback) summary.postsDateFallbackKept += 1
  }

  if (dry) {
    say(
      `сухой прогон: записей черновиков ${drafts.length}; из них без дома ${summary.postsUnassigned} ` +
        `(по владельцу пристроится ${summary.postsAssignedByOwner}, по тексту ${summary.postsAssignedByText}); ` +
        `без даты оригинала ${summary.postsDateFallbackKept}`,
    )
    summary.ok = true
    return summary
  }

  for (const item of plan) {
    const { doc } = item
    if (item.publishIso === null) {
      // Пропуск без даты — штатный исход, а не ошибка: нечего ставить в
      // publishedAt, запись остаётся черновиком для рук редактора.
      summary.postsSkippedNoDate += 1
      say(`запись «${doc.title ?? doc.id}» без даты — пропускаем, руками`)
      continue
    }
    try {
      await payload.update({
        collection: 'posts',
        id: doc.id,
        context: { disableRevalidate: true },
        data: {
          _status: 'published',
          publishedAt: item.publishIso,
          ...(item.institutionId !== undefined ? { institution: item.institutionId } : {}),
        },
      })
      const check = (await payload.findByID({ collection: 'posts', id: doc.id, depth: 0 })) as unknown as PostRow
      if (check?._status === 'published') summary.postsPublished += 1
      else err(`запись «${doc.title ?? doc.id}»: статус после записи не published`)
    } catch (e) {
      err(`запись «${doc.title ?? doc.id}» не опубликовалась: ${(e as Error)?.message ?? e}`)
    }
  }

  // Уже опубликованным правим только дату (статус не трогаем): дата публикации
  // везде — дата оригинала.
  const published = (await payload.find({
    collection: 'posts',
    where: { _status: { equals: 'published' } },
    pagination: false,
    depth: 0,
    limit: 5000,
  })) as unknown as { docs: PostRow[] }
  for (const doc of published.docs ?? []) {
    const { iso } = resolvePublishDate(doc.date, null)
    if (!iso || !doc.publishedAt) continue
    if (sameMinute(iso, doc.publishedAt)) continue
    try {
      await payload.update({
        collection: 'posts',
        id: doc.id,
        context: { disableRevalidate: true },
        data: { publishedAt: iso },
      })
      summary.postsBackfilled += 1
    } catch (e) {
      err(`запись «${doc.title ?? doc.id}»: дата не перезаписалась: ${(e as Error)?.message ?? e}`)
    }
  }

  say(
    `итог: записей опубликовано ${summary.postsPublished} из ${drafts.length}, дат уже опубликованным поправлено ${summary.postsBackfilled}, ` +
      `без даты пропущено ${summary.postsSkippedNoDate}, без дома осталось ${summary.postsUnassigned}, с ошибкой ${summary.failed}`,
  )

  // Один сброс кэша вместо сотен из хуков (записи писались с disableRevalidate).
  safeRevalidatePath('/', 'page')
  safeRevalidatePath('/news', 'page')
  safeRevalidatePath('/news/[slug]', 'page')
  safeRevalidatePath('/dk', 'page')
  safeRevalidatePath('/dk/[slug]', 'page')

  summary.ok = summary.failed === 0
  return summary
}
