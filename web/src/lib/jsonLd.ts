// Структурированные данные (schema.org) для поисковиков.
//
// Чистые сборщики — без Payload и без Next: их проверяют юнитами, а страницы
// лишь подставляют результат в <script type="application/ld+json">.
//
// Что даёт разметка: поисковик показывает у новости дату, дом культуры и
// картинку в результатах, а не голубую ссылку. Для районного портала это
// разница между «зашли» и «пролистали».

import { canonicalOf, SITE_DESC, SITE_NAME, SITE_URL } from './site'

// ⚠️ JSON внутри <script> экранируется ОСОБО. Обычный escape не годится:
// `</script>` внутри строки закрывает тег раньше времени, и всё после него
// уезжает в текст страницы. Заменяем угловые скобки на \u003c/\u003e — JSON
// остаётся валидным, а HTML-парсер тега не видит. Именно поэтому сборщик
// возвращает СТРОКУ, а не объект: страница обязана вставить её через
// dangerouslySetInnerHTML, не пересобирая JSON заново.
export function toJsonLdScript(data: object): string {
  return JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
}

// Убирает ключи со значением undefined.
//
// `JSON.stringify` их и так выбрасывает, но объект-то остаётся грязным: тест на
// отсутствие поля краснеет, а следующий, кто заменит stringify на что-то иное
// (или станет читать объект напрямую), получит `undefined` там, где разметка
// обещает «поля нет». Чистим на сборке — обещание и проверка совпадают.
function compact<T extends Record<string, unknown>>(input: T): T {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) out[key] = value
  }
  return out as T
}

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: canonicalOf('/icon.png'),
    description: SITE_DESC,
  }
}

// NewsArticle — только для типа записи `news`. Афиша (type: 'event')
// размечается как Event: у неё есть дата проведения, и это ровно то, что
// поисковик показывает блоком «события», а не строчкой новости.
export function articleJsonLd(input: {
  slug: string
  title: string
  description?: string | null
  date?: string | null
  publishedAt?: string | null
  imageUrl?: string | null
  category?: string | null
  institutionTitle?: string | null
}) {
  const url = canonicalOf(`/news/${input.slug}`)
  const datePublished = input.publishedAt || input.date || undefined
  return compact({
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: input.title,
    description: input.description ?? undefined,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    datePublished,
    dateModified: datePublished,
    image: input.imageUrl ? [input.imageUrl] : undefined,
    articleSection: input.category ?? undefined,
    inLanguage: 'ru-RU',
    publisher: organizationJsonLd(),
    author: input.institutionTitle
      ? { '@type': 'Organization', name: input.institutionTitle }
      : undefined,
  })
}

export function eventJsonLd(input: {
  slug: string
  title: string
  description?: string | null
  date?: string | null
  endDate?: string | null
  imageUrl?: string | null
  institutionTitle?: string | null
}) {
  const url = canonicalOf(`/news/${input.slug}`)
  return compact({
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: input.title,
    description: input.description ?? undefined,
    url,
    startDate: input.date ?? undefined,
    endDate: input.endDate ?? undefined,
    eventStatus: 'https://schema.org/EventScheduled',
    image: input.imageUrl ? [input.imageUrl] : undefined,
    inLanguage: 'ru-RU',
    organizer: input.institutionTitle
      ? { '@type': 'Organization', name: input.institutionTitle }
      : undefined,
  })
}

export function institutionJsonLd(input: {
  slug: string
  title: string
  description?: string | null
  address?: string | null
  phone?: string | null
  imageUrl?: string | null
}) {
  return compact({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: input.title,
    description: input.description ?? undefined,
    url: canonicalOf(`/dk/${input.slug}`),
    image: input.imageUrl ? [input.imageUrl] : undefined,
    telephone: input.phone ?? undefined,
    address: input.address ? { '@type': 'PostalAddress', streetAddress: input.address } : undefined,
    parentOrganization: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
  })
}
