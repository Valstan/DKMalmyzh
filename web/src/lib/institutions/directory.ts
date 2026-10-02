import { institutionUrl, type InstitutionRef } from '../institutions'

// Как показывать учреждение в списке и какую картинку ставить.
//
// Три отдельных решения, которые легко спутать: ПОДПИСЬ (что видно в списке),
// ПОИСК (по чему ищет посетитель) и ЭМОДЗИ (по чему глаз цепляется). Смешали их
// в одну функцию — и любая правка одной тянет за собой две другие.
//
// ⚠️ Файл без `node:`-импортов: им пользуется клиентский компонент списка.

/** Учреждение, у которого подпись — короткая (дом культуры, клуб). */
export type DirectoryItem = InstitutionRef & {
  settlement?: string | null
  description?: string | null
  isHead?: boolean | null
}

/**
 * Дом культуры в селе или сельский клуб — их подпись в списке это ИМЯ НАСЕЛЁННОГО
 * ПУНКТА, а не «Дом культуры села Савали». Родительный падеж в заголовке списка
 * читается тяжелее и сравнивать его в уме бесполезно.
 *
 * Всё, что домом культуры НЕ является (ДШИ, музей, библиотека, головной РЦКД),
 * показывается полным названием: там название и есть различие между учреждениями,
 * терять его нельзя.
 *
 * Что считается домом культуры — по названию, а не по флажку в базе: флажка нет,
 * а правило всё равно должно работать на следующее учреждение, которое добавит
 * владелец, без правки кода.
 */
export function isVillageHouse(ref: DirectoryItem): boolean {
  const title = (ref.title ?? '').trim().toLowerCase()
  if (!title) return false
  return (
    title.includes('дом культуры') ||
    title.includes('дома культуры') ||
    title.includes('сельск') ||
    title.includes('клуб') ||
    title.includes('дом ремесел')
  )
}

/** «с. Калинино» → «Калинино»: префикс населённого пункта убираем. */
export function stripSettlementPrefix(value: string): string {
  return value
    .trim()
    .replace(/^(с(?:еление)?|д(?:еревня)?|п(?:ос[её]лок)?|пгт)\.\s*/iu, '')
    .trim()
}

/**
 * Подпись в списке.
 *
 * У дома культуры берётся короткое название, а если его нет — населённый пункт
 * без префикса. Оба могут отсутствовать, и тогда единственное, что можно показать,
 * — полное название из базы; молча показывать «Без названия» нельзя.
 */
export function institutionDisplayName(ref: DirectoryItem): string {
  const title = (ref.title ?? '').trim()
  const short = (ref.shortTitle ?? '').trim()
  const settlement = stripSettlementPrefix(ref.settlement ?? '')

  // У учреждения, которое не дом культуры, показываем ПОЛНОЕ название, даже если
  // короткое заполнено. «ДШИ» в списке из тридцати трёх пунктов не говорит
  // посетителю ничего; «Детская школа искусств Малмыжа» говорит всё. Первая версия
  // правила отдавала тут короткое имя, и юнит на реальных данных (ДШИ, музей,
  // заведённые 03.10) это поймал.
  if (!isVillageHouse(ref)) return title || short || settlement
  return short || settlement || title
}

/** Подпись в кавычках `title` — она же уходит в поиск. */
export function institutionFullName(ref: DirectoryItem): string {
  return (ref.title ?? '').trim() || institutionDisplayName(ref)
}

// Эмодзи по типу учреждения. Ключи — по УБИВАЕМОЙ нижней строке названия.
//
// Зачем отдельная карта по slug: владелец может захотеть, чтобы конкретному дому
// досталась своя картинка, а правило по типу даст всем тридцати сельским один и
// тот же театр. Пустая карта — не ошибка, а готовое место под правку руками.
const EMOJI_BY_SLUG: Record<string, string> = {}

const EMOJI_RULES: [RegExp, string][] = [
  [/школ[аы] искусств|\bдши\b/i, '🎹'],
  [/музе/i, '🏺'],
  [/библиотек/i, '📚'],
  [/кинотеатр|кино/i, '🎬'],
  [/парк|сквер|сад/i, '🌳'],
  [/спорт|физкультур/i, '⚽'],
  [/детск.*сад/i, '🧸'],
  [/центр культуры|досуга|\bрцкд\b/i, '🎪'],
]

/**
 * Картинка учреждения.
 *
 * Сельские дома культуры получают один и тот же театр — и это честно: все тридцать
 * действительно дома культуры, и различать их выдуманными значками значило бы
 * врать. Различие делают другие типы (школа искусств, музей, библиотека), а если
 * владелец захочет различать конкретные дома — `EMOJI_BY_SLUG` для этого и есть.
 */
export function institutionEmoji(ref: DirectoryItem): string {
  const bySlug = EMOJI_BY_SLUG[(ref.slug ?? '').trim().toLowerCase()]
  if (bySlug) return bySlug
  const title = institutionFullName(ref)
  for (const [rule, emoji] of EMOJI_RULES) {
    if (rule.test(title)) return emoji
  }
  return '🎭'
}

/** Слова, по которым ищет посетитель, в одной строке. */
export function institutionSearchText(ref: DirectoryItem): string {
  return [
    institutionDisplayName(ref),
    institutionFullName(ref),
    ref.shortTitle,
    ref.settlement,
    ref.slug,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

/**
 * Совпадение по запросу. Совпадение в любом месте строки, регистр не важен —
 * как и просил заказчик: «кит» находит и Малый Китяк, и Большой Китяк, и Пор-Китяк.
 *
 * Пробелы внутри запроса НЕ схлопываются в «и»: иначе «китяк пор» молча ничего не
 * найдёт, хотя человек написал именно два куска названия.
 */
export function matchesInstitutionQuery(ref: DirectoryItem, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return institutionSearchText(ref).includes(q)
}

/** Список, отфильтрованный запросом, в исходном порядке. */
export function filterInstitutions<T extends DirectoryItem>(items: T[], query: string): T[] {
  const q = query.trim()
  if (!q) return items
  return items.filter((item) => matchesInstitutionQuery(item, q))
}

// ─── Готовая строка для показа ───────────────────────────────────────────────
//
// Всё, что нельзя считать в браузере, считается на сервере, и на клиент уходит
// уже готовая строка. Причина конкретная: читаемое имя личного домена требует
// `node:url`, а он в браузерный бандл Next не собирается. Обойти это можно было
// бы двумя способами — посчитать домен в компоненте (сборка падает) или дублировать
// фильтр в компоненте (расходится с тем, что тут). Поэтому строка собирается
// здесь, а компонент только показывает и отбирает по готовой строке `search`.
// Один фильтр на оба места.

export type DirectoryRow = {
  id: string | number
  name: string
  fullName: string
  emoji: string
  url: string
  external: boolean
  /** Подпись под названием: «с. Калинино», «головное учреждение», домен. */
  meta: string
  description?: string | null
  /** Строка поиска стро��ыми строчными — готовая, чтобы не пересобирать в браузере. */
  search: string
}

/** Учреждение → строка для показа. `domainName` внедряется: он тянет node:url. */
export function toDirectoryRows(
  institutions: DirectoryItem[],
  domainName: (ref: DirectoryItem) => string,
): DirectoryRow[] {
  return institutions.map((institution) => {
    const url = institutionUrl(institution)
    const domain = domainName(institution)
    const meta = [
      institution.isHead ? 'головное учреждение' : (institution.settlement ?? '').trim(),
      domain ? `· ${domain}` : '',
    ]
      .filter(Boolean)
      .join(' ')

    return {
      id: institution.id,
      name: institutionDisplayName(institution),
      fullName: institutionFullName(institution),
      emoji: institutionEmoji(institution),
      url,
      external: /^https?:\/\//i.test(url),
      meta,
      description: institution.description ?? null,
      search: institutionSearchText(institution),
    }
  })
}

/** Совпадение по готовой строке — та же семантика, что у `matchesInstitutionQuery`. */
export function matchesRow(row: DirectoryRow, query: string): boolean {
  const q = query.trim().toLowerCase()
  return !q || row.search.includes(q)
}

export function filterRows(rows: DirectoryRow[], query: string): DirectoryRow[] {
  const q = query.trim()
  return q ? rows.filter((row) => matchesRow(row, q)) : rows
}