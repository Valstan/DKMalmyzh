// Форма выгрузки Калинино (D-074) и её чистый разбор — без Payload и без диска.
//
// Файлы выгрузки делает `deploy/handover/export.sql` их репозитория: `posts.json`
// (json_agg по постам с обложкой, галереей и видео), `categories.json`,
// `media.json`, `media-manifest.tsv` и распакованный `media/`. Всё, что здесь
// лежит, проверяется юнитами на подставных данных той же формы, а гейт гоняет
// сам перенос на живой БД (scripts/kalinino-transfer-selftest.ts).

export type HandoverGalleryItem = {
  order?: number | null
  mediaId?: number | null
  filename?: string | null
  path?: string | null
}

export type HandoverVideo = {
  title?: string | null
  url?: string | null
  _order?: number | null
}

export type HandoverPost = {
  id: number
  title: string
  slug: string
  date?: string | null
  publishedAt?: string | null
  status?: string | null
  vkPostId?: string | null
  sourceUrl?: string | null
  categoryId?: number | null
  categorySlug?: string | null
  legacyCategory?: string | null
  coverId?: number | null
  coverFilename?: string | null
  gallery?: HandoverGalleryItem[] | null
  videos?: HandoverVideo[] | null
  content?: unknown
  createdAt?: string | null
  updatedAt?: string | null
}

export type HandoverCategory = {
  id: number
  title: string
  slug: string
  order?: number | null
}

/** Запись, пригодная к переносу: с ключом идемпотентности и адресом. */
export type TransferablePost = HandoverPost & { vkPostId: string; slug: string }

export type ParsedHandover = {
  posts: TransferablePost[]
  /** Записи без vkPostId: переносить нечем — ключа идемпотентности нет. */
  withoutKey: HandoverPost[]
  categories: Map<string, HandoverCategory>
}

/**
 * Разбор `posts.json` и `categories.json`. Записи без `vkPostId` откладываются,
 * а не отбрасываются молча: их число попадает в отчёт.
 */
export function parseHandover(postsRaw: unknown, categoriesRaw: unknown): ParsedHandover {
  const posts: TransferablePost[] = []
  const withoutKey: HandoverPost[] = []

  for (const item of asArray<HandoverPost>(postsRaw)) {
    if (!item || typeof item !== 'object') continue
    const vkPostId = typeof item.vkPostId === 'string' ? item.vkPostId.trim() : ''
    const slug = typeof item.slug === 'string' ? item.slug.trim() : ''
    if (!vkPostId || !slug) {
      withoutKey.push(item)
      continue
    }
    posts.push({ ...item, vkPostId, slug })
  }

  const categories = new Map<string, HandoverCategory>()
  for (const cat of asArray<HandoverCategory>(categoriesRaw)) {
    if (cat && typeof cat.slug === 'string' && cat.slug) categories.set(cat.slug, cat)
  }

  return { posts, withoutKey, categories }
}

function asArray<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[]
  if (raw && typeof raw === 'object') {
    for (const key of ['items', 'rows', 'data', 'records', 'posts']) {
      const value = (raw as Record<string, unknown>)[key]
      if (Array.isArray(value)) return value as T[]
    }
  }
  return []
}

/** Вид записи у портала по рубрике Калинино: их «Афиша» — наш `event`. */
export function postTypeFor(categorySlug: string | null | undefined): 'news' | 'event' {
  return categorySlug === 'afisha' ? 'event' : 'news'
}

/**
 * Текстовая рубрика портала: название рубрики Калинино по slug. Неизвестный
 * slug остаётся как есть — это лучше, чем потерять метку, а в отчёте он виден.
 */
export function categoryLabelFor(
  categorySlug: string | null | undefined,
  categories: Map<string, HandoverCategory>,
): string | undefined {
  if (!categorySlug) return undefined
  return categories.get(categorySlug)?.title || categorySlug
}

export type NormalizedVideo = { title?: string; url: string }

/** Видео из выгрузки: только с адресом http(s), в порядке `_order`. */
export function normalizeVideos(raw: HandoverVideo[] | null | undefined): NormalizedVideo[] {
  if (!Array.isArray(raw)) return []
  return [...raw]
    .sort((a, b) => (a?._order ?? 0) - (b?._order ?? 0))
    .map((v) => ({
      url: typeof v?.url === 'string' ? v.url.trim() : '',
      title: typeof v?.title === 'string' && v.title.trim() ? v.title.trim() : undefined,
    }))
    .filter((v) => /^https?:\/\//i.test(v.url))
}

/** Имена файлов записи: обложка первой, затем галерея по порядку, без повторов. */
export function mediaFilenamesOf(post: HandoverPost): string[] {
  const names: string[] = []
  const push = (name: unknown) => {
    if (typeof name === 'string' && name && !names.includes(name)) names.push(name)
  }
  push(post.coverFilename)
  for (const item of [...(post.gallery ?? [])].sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0))) {
    push(item?.filename)
  }
  return names
}

/**
 * Lexical-документ пригоден для нашего поля `content`? Проверяем форму, а не
 * содержимое: у корня должен быть массив детей. Всё остальное рендерер
 * пропустит, но пустое поле в админке откроется со сломанным состоянием.
 */
export function isLexicalDoc(value: unknown): value is { root: { children: unknown[] } } {
  if (!value || typeof value !== 'object') return false
  const root = (value as { root?: { children?: unknown } }).root
  return Boolean(root && Array.isArray(root.children))
}

/** Форма каталога выгрузки, допустимая в query-параметре маршрута. */
export const HANDOVER_DIR_RE = /^\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+$/

export function isSafeHandoverDir(value: string): boolean {
  if (!HANDOVER_DIR_RE.test(value)) return false
  return !value.split('/').some((part) => part === '..')
}

export type SlugCollision = {
  slug: string
  /** vkPostId записей выгрузки под этим адресом. */
  incoming: string[]
  /** Чей адрес занят в базе: vkUid либо «ручная запись #id». */
  takenBy?: string
}

/**
 * Коллизии адресов: внутри самой выгрузки (у Калинино slug в базе не уникален,
 * как и у нас) и с записями портала, которые НЕ являются той же записью по
 * vkUid. Одна и та же запись (совпал vkUid) — не коллизия: она обновится.
 */
export function findSlugCollisions(
  posts: TransferablePost[],
  taken: Map<string, { vkUid?: string | null; id: number | string }>,
): SlugCollision[] {
  const bySlug = new Map<string, string[]>()
  for (const post of posts) {
    const list = bySlug.get(post.slug) ?? []
    list.push(post.vkPostId)
    bySlug.set(post.slug, list)
  }

  const collisions: SlugCollision[] = []
  for (const [slug, incoming] of bySlug) {
    const owner = taken.get(slug)
    const foreign = owner && (!owner.vkUid || !incoming.includes(owner.vkUid))
    if (incoming.length > 1 || foreign) {
      collisions.push({
        slug,
        incoming,
        takenBy: foreign ? (owner.vkUid ? owner.vkUid : `ручная запись #${owner.id}`) : undefined,
      })
    }
  }
  return collisions.sort((a, b) => a.slug.localeCompare(b.slug))
}
