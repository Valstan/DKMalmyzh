import type { Payload } from 'payload'

// Чистка дублей новостей после двойных прогонов импорта (заказ владельца
// 30.09).
//
// Что фактически накопилось (проверено на живых данных 973 записи):
// точных дублей «тот же заголовок и та же дата» — НОЛЬ, потому что `vkUid`
// уникален и второй прогон той же стены отбивался базой. Дубли у нас другого
// рода: ОДИН И ТОТ ЖЕ материал лежит в двух стенах ВК — у РЦКД их две (группа
// и личная страница), а районные новости повторяют сельские ДК. У копий разные
// идентификаторы ВК и разные даты (каждая стена перепостила в своё время), но
// заголовок и текст совпадают: «КРОСС НАЦИИ — 2026!» отличается на 18 секунд.
//
// Поэтому признак дубля — заголовок И текст, а не заголовок И дата. По дате
// сравнивать нельзя ещё и потому, что разные посты одного дня с одинаковым
// заголовком — обычное дело («27 августа 2026г.»), а текст у них разный.
//
// Чего операция НЕ трогает:
//   - записи без текста (перепосты «запись от 2026-09-21») — их заголовок
//     совпадает, а содержания нет; судьбу решает человек;
//   - записи с разным текстом;
//   - записи одного заголовка и текста, но с разницей в дате больше окна.
//
// Идемпотентна: повторный прогон находит по одной копии на материал и ничего
// не удаляет.

export const DEDUPE_WINDOW_DAYS = 30

// Заглушки, которыми ВК отвечает на удалённые посты: содержания в них нет,
// только надпись. Держать их на сайте незачем, но и «дублями» они не являются —
// поэтому операция считает их ОТДЕЛЬНОЙ строкой отчёта, а не молча частью
// «неразбираемого».
export const TOMBSTONE_TITLES = ['пост удалён', 'запись удалена', 'запись недоступна']

export function isTombstone(doc: Pick<DedupeDoc, 'title'>): boolean {
  const title = normaliseText(doc.title)
  if (!title) return false
  return TOMBSTONE_TITLES.includes(title)
}

export type DedupeDoc = {
  id: number
  title?: string | null
  text?: string | null
  date?: string | null
  galleryCount?: number
  hasCover?: boolean
  isHeadInstitution?: boolean
  institutionId?: number | null
}

// Нормализация для сравнения: регистр, лишние пробелы, неразрывные пробелы.
// Эмодзи и пунктуацию НЕ трогаем: они часть содержания, и «РЦКД Малмыж: запись
// от 2026-09-21» различаются только идентификатором ВК.
export function normaliseText(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

// Ключ материала. `null` — судить нельзя: нет заголовка или нет текста.
export function dedupeKey(doc: DedupeDoc): string | null {
  const title = normaliseText(doc.title)
  const text = normaliseText(doc.text)
  if (!title || !text) return null
  return `${title}||${text}`
}

// Какую копию оставить. Порядок предпочтений:
//   1. с обложкой — без картинки копия хуже;
//   2. из головного учреждения (РЦКД) — районная новость уезжает туда;
//   3. с большим числом фото;
//   4. с меньшим id — первая заливка, «оригинал» на нашей стороне.
export function keeperId(docs: DedupeDoc[]): number {
  const scored = docs.map((doc) => ({
    doc,
    score:
      (doc.hasCover ? 4 : 0) +
      (doc.isHeadInstitution ? 2 : 0) +
      Math.min(doc.galleryCount ?? 0, 20),
  }))
  scored.sort((a, b) => b.score - a.score || a.doc.id - b.doc.id)
  return scored[0]?.doc.id as number
}

export type DedupeGroup = { key: string; keeper: number; remove: number[]; title: string }

export type DedupeSummary = {
  ok: boolean
  dry: boolean
  scanned: number
  undecidable: number
  groups: number
  removed: number
  tombstones: number
  tombstonesRemoved: number
  byInstitution: { slug?: string | null; title?: string | null; removed: number }[]
  samples: { title: string; keeper: number; remove: number[] }[]
  messages: string[]
}

const groupDuplicates = (docs: DedupeDoc[], windowDays: number): DedupeGroup[] => {
  const buckets = new Map<string, DedupeDoc[]>()
  for (const doc of docs) {
    const key = dedupeKey(doc)
    if (!key) continue
    const bucket = buckets.get(key)
    if (bucket) bucket.push(doc)
    else buckets.set(key, [doc])
  }
  const groups: DedupeGroup[] = []
  for (const [key, bucket] of buckets) {
    if (bucket.length < 2) continue
    const dated = bucket.filter((doc) => doc.date)
    // Без дат материал не раскладываем по копиям, но и не пропускаем молча:
    // такие группы уйдут в отчёт отдельной строкой.
    if (dated.length !== bucket.length) continue
    const times = dated.map((doc) => new Date(doc.date as string).getTime())
    const span = Math.max(...times) - Math.min(...times)
    if (span > windowDays * 86400000) continue
    const keeper = keeperId(bucket)
    const remove = bucket.filter((doc) => doc.id !== keeper).map((doc) => doc.id)
    if (remove.length === 0) continue
    groups.push({ key, keeper, remove, title: normaliseText(bucket[0].title) })
  }
  return groups
}

export async function dedupePosts(
  payload: Payload,
  options: { dry?: boolean; windowDays?: number; log?: (message: string) => void } = {},
): Promise<DedupeSummary> {
  const dry = options.dry === true
  const windowDays = options.windowDays ?? DEDUPE_WINDOW_DAYS
  const say = (message: string) => options.log?.(message)
  const summary: DedupeSummary = {
    ok: true,
    dry,
    scanned: 0,
    undecidable: 0,
    groups: 0,
    removed: 0,
    tombstones: 0,
    tombstonesRemoved: 0,
    byInstitution: [],
    samples: [],
    messages: [],
  }

  // Читаем ОСНОВНЫЕ записи, без `draft: true`: с флагом Payload отдаёт версии
  // из `_posts_v`, и удалять мы будем не то (урок reslug).
  const all = await payload.find({
    collection: 'posts',
    pagination: false,
    depth: 0,
    limit: 5000,
    sort: 'id',
  })
  const docs = all.docs as unknown as DedupeDoc[]
  summary.scanned = docs.length

  // `undecidable` считаем по подготовленным записям, где текст уже разобран:
  // в сырых документах поля `content` нет вовсе, и счётчик вышел бы «все
  // записи» — то есть на первом же прогоне сообщал бы чушь.
  const heads = new Map<number, boolean>()
  const institutions = await payload.find({
    collection: 'institutions',
    pagination: false,
    depth: 0,
    limit: 200,
  })
  for (const doc of institutions.docs as unknown as { id: number; isHead?: boolean | null }[]) {
    heads.set(doc.id, doc.isHead === true)
  }
  const slugs = new Map<number, { slug?: string | null; title?: string | null }>()
  for (const doc of institutions.docs as unknown as {
    id: number
    slug?: string | null
    title?: string | null
  }[]) {
    slugs.set(doc.id, { slug: doc.slug ?? null, title: doc.title ?? null })
  }

  const lexicalText = (data: unknown): string => {
    const out: string[] = []
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object') return
      const row = node as Record<string, unknown>
      if (row['type'] === 'text' && typeof row['text'] === 'string') out.push(row['text'])
      const children = row['children']
      if (Array.isArray(children)) children.forEach(walk)
      if (row['root']) walk(row['root'])
    }
    walk(data)
    return out.join('\n')
  }

  const prepared: DedupeDoc[] = (all.docs as unknown as Record<string, unknown>[]).map((row) => {
    const institutionId = typeof row['institution'] === 'number' ? row['institution'] : null
    const gallery = Array.isArray(row['gallery']) ? row['gallery'].length : 0
    return {
      id: row['id'] as number,
      title: (row['title'] as string | null) ?? null,
      text: lexicalText(row['content']),
      date: (row['date'] as string | null) ?? null,
      galleryCount: gallery,
      hasCover: Boolean(row['cover']),
      isHeadInstitution: institutionId === null ? false : heads.get(institutionId) === true,
      institutionId,
    }
  })

  // Заглушки «Пост удалён» разбираем отдельно: содержания в них нет, в пару
  // к дублям они не попадают, а держать их на сайте незачем.
  const tombstones = prepared.filter((doc) => isTombstone(doc))
  summary.tombstones = tombstones.length
  summary.undecidable = prepared.filter((doc) => dedupeKey(doc) === null && !isTombstone(doc)).length

  const groups = groupDuplicates(prepared, windowDays)
  summary.groups = groups.length
  summary.removed = groups.reduce((sum, group) => sum + group.remove.length, 0)
  summary.samples = groups.slice(0, 20).map((group) => ({
    title: group.title,
    keeper: group.keeper,
    remove: group.remove,
  }))

  const tally = new Map<string, { slug?: string | null; title?: string | null; removed: number }>()
  for (const group of groups) {
    for (const id of group.remove) {
      const doc = prepared.find((item) => item.id === id)
      const ref = doc?.institutionId ? slugs.get(doc.institutionId) : undefined
      const key = ref?.slug ?? 'без-дк'
      const row = tally.get(key) ?? { slug: ref?.slug ?? null, title: ref?.title ?? null, removed: 0 }
      row.removed += 1
      tally.set(key, row)
    }
  }
  summary.byInstitution = [...tally.values()].sort((a, b) => b.removed - a.removed).slice(0, 40)

  if (dry) {
    say(
      `сухой прогон: записей ${summary.scanned}, из них без текста (не разбираем) ${summary.undecidable}; ` +
        `групп дублей ${summary.groups}, копий к удалению ${summary.removed}; ` +
        `заглушек «пост удалён» ${summary.tombstones}`,
    )
    return summary
  }

  for (const group of groups) {
    for (const id of group.remove) {
      try {
        await payload.delete({
          collection: 'posts',
          id,
          context: { disableRevalidate: true },
        })
      } catch (err) {
        summary.ok = false
        summary.messages.push(`запись #${id} не удалилась: ${(err as Error)?.message ?? err}`)
      }
    }
  }

  for (const doc of tombstones) {
    try {
      await payload.delete({
        collection: 'posts',
        id: doc.id,
        context: { disableRevalidate: true },
      })
      summary.tombstonesRemoved += 1
    } catch (err) {
      summary.ok = false
      summary.messages.push(`заглушка #${doc.id} не удалилась: ${(err as Error)?.message ?? err}`)
    }
  }

  // Проверка: после удаления по ключу должна остаться ровно одна запись.
  const after = await payload.find({ collection: 'posts', pagination: false, depth: 0, limit: 5000, sort: 'id' })
  const afterDocs = after.docs as unknown as DedupeDoc[]
  const left = groupDuplicates(
    afterDocs.map((row) => ({ ...row, text: normaliseText(row.text) })),
    windowDays,
  )
  if (left.length > 0) {
    summary.ok = false
    summary.messages.push(`после чистки осталось групп-дублей: ${left.length}`)
  }

  const leftTombstones = after.docs.filter((row) =>
    isTombstone(row as unknown as DedupeDoc),
  )
  if (leftTombstones.length > 0) {
    summary.ok = false
    summary.messages.push(`после чистки осталось заглушек: ${leftTombstones.length}`)
  }

  say(
    `итог: записей было ${summary.scanned}, удалено ${summary.removed} (групп ${summary.groups}), ` +
      `заглушек удалено ${summary.tombstonesRemoved}, осталось ${after.docs.length}, ошибок ${summary.messages.length}`,
  )
  return summary
}
