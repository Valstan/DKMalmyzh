import config from '@payload-config'
import { getPayload } from 'payload'

import { FEED_MAX_PAGE_SIZE, FEED_PAGE_SIZE, getFeedPage } from '../src/lib/feed'
import { mentionedByStems } from '../src/lib/feedShape'
import { mentionStems } from '../src/lib/institutions/mentionFeed'

// Гейт ленты: постраничная выборка на живой БД после накатанной миграции.
//
// Юнитами проверяется чистая часть (разбор запроса, обрезка карточки, условие,
// склейка страниц) — здесь то, что юнитами не видно: что Payload действительно
// режет страницы по 20, что порядок «новые сверху», что раздел отдаёт ТОЛЬКО
// свои материалы, а черновик не отдаётся никуда.
//
// Данные свои и с гарантированно известным числом записей: 25 новостей и одна
// афиша в отдельном доме культуры. Уборка за собой обязательна — база гейта
// общая с остальными шагами.

// Раздел без своего сообщества из справочника: его лента собирается по
// упоминанию села. Берём настоящий, а не выдуманный: механизм помечен в
// справочнике, и выдуманный слаг проверял бы несуществующий флаг.
const MENTION_SLUG = 'nosly'
const SLUG = 'selftest-feed-house'

const main = async () => {
  const payload = await getPayload({ config })
  const problems: string[] = []
  const ctx = { disableRevalidate: true }
  const createdPostIds: number[] = []

  const institution = await payload.create({
    collection: 'institutions',
    context: ctx,
    data: {
      title: 'Самотестовый ДК (лента)',
      shortTitle: 'Самотест-лента',
      settlement: 'с. Самотестово',
      slug: 'selftest-feed-house',
      _status: 'published',
    },
  })
  const houseId = institution.id

  // Даты по возрастанию: по дате создания порядок ленты должен быть обратным —
  // иначе проверяется порядок вставки, а не сортировка.
  const base = Date.parse('2026-01-01T00:00:00.000Z')
  const mk = async (
    index: number,
    type: 'news' | 'event',
    dayOffset: number,
    title?: string,
  ): Promise<number> => {
    const vkUid = `-999777888_${9000 + index}`
    const doc = await payload.create({
      collection: 'posts',
      context: ctx,
      data: {
        title: title ?? `Самотест ленты №${index}`,
        slug: `selftest-feed-${index}`,
        date: new Date(base + dayOffset * 86400000).toISOString(),
        type,
        source: 'manual',
        institution: houseId,
        vkUid,
        sourceUrl: `https://vk.com/wall${vkUid}`,
        _status: 'published',
      },
    })
    createdPostIds.push(doc.id)
    return doc.id
  }

  for (let i = 0; i < 25; i += 1) {
    await mk(i, 'news', i)
  }
  // Афиша этого же дома — в ленту новостей попасть не должна.
  await mk(100, 'event', 30)
  // Черновик — не должен появиться ни в одной ленте. Его `vkUid` заведомо вне
  // диапазона `mk()` выше: `vkUid` уникален, и пересечение уронило бы гейт на
  // уникальности вместо проверки ленты.
  const draft = await payload.create({
    collection: 'posts',
    context: ctx,
    draft: true,
    data: {
      title: 'Самотест ленты: черновик',
      slug: 'selftest-feed-draft',
      date: new Date(base + 40 * 86400000).toISOString(),
      type: 'news',
      source: 'manual',
      institution: houseId,
      vkUid: '-999777888_9999',
      sourceUrl: 'https://vk.com/wall-999777888_9999',
      _status: 'draft',
    },
  })
  createdPostIds.push(draft.id)

  // 1. Первая страница раздела: ровно 20 карточек, порядок — по дате, новые сверху.
  const first = await getFeedPage({ limit: FEED_PAGE_SIZE, institutionSlug: SLUG })
  if (first.docs.length !== FEED_PAGE_SIZE) {
    problems.push(`первая страница: ${first.docs.length} карточек, ожидалось ${FEED_PAGE_SIZE}`)
  }
  if (first.totalPages !== 2) problems.push(`страниц: ${first.totalPages}, ожидалось 2 (25 новостей + 1 афиша)`)
  if (!first.hasMore) problems.push('hasMore=false при непустой второй странице')
  if (first.docs[0]?.title !== 'Самотест ленты №100') {
    problems.push(`первым идёт «${first.docs[0]?.title ?? '—'}», а самая свежая — афиша`)
  }

  // 2. Вторая страница добирает остаток, пересечений с первой нет.
  const second = await getFeedPage({ page: 2, limit: FEED_PAGE_SIZE, institutionSlug: SLUG })
  const ids = new Set(first.docs.map((doc) => doc.id))
  const overlap = second.docs.filter((doc) => ids.has(doc.id))
  if (overlap.length > 0) problems.push(`страницы пересеклись по ${overlap.length} записям`)
  if (second.docs.length !== 6) problems.push(`вторая страница: ${second.docs.length}, ожидалось 6`)
  if (second.hasMore) problems.push('hasMore=true на последней странице')

  // 3. Раздел — только этот дом: чужих записей в нём быть не может.
  const newsFeed = await getFeedPage({ institutionSlug: SLUG, type: 'news' })
  const foreign = newsFeed.docs.filter((doc) => doc.institution?.slug !== SLUG)
  if (foreign.length > 0) problems.push(`в разделе ${foreign.length} чужих записей`)
  if (newsFeed.totalDocs !== 25) problems.push(`в ленте новостей ${newsFeed.totalDocs} записей, ожидалось 25`)

  // 4. Афиша отдаётся отдельно и не смешивается с новостями.
  const eventFeed = await getFeedPage({ institutionSlug: SLUG, type: 'event' })
  if (eventFeed.totalDocs !== 1) problems.push(`в афише ${eventFeed.totalDocs} записей, ожидалась 1`)
  if (eventFeed.docs.some((doc) => doc.type !== 'event')) problems.push('в афише есть не-афиша')

  // 5. Черновик не отдаётся ни в одну ленту.
  const all = await getFeedPage({ institutionSlug: SLUG, limit: FEED_MAX_PAGE_SIZE })
  if (all.docs.some((doc) => doc.slug === 'selftest-feed-draft')) problems.push('черновик попал в ленту')

  // 6. Неизвестный слаг — это «неизвестный дом», а не «вся лента района».
  const unknown = await getFeedPage({ institutionSlug: 'selftest-net-takogo-doma' })
  if (unknown.docs.length !== 0) problems.push(`неизвестный слаг вернул ${unknown.docs.length} чужих записей`)

  // 7. Лента раздела без своего сообщества: заголовки по упоминанию села.
  //    Записи выпущены другим домом (самотестовым) — в ленте Нослов они должны
  //    появиться с его бейджем, а чужое место — не должно.
  const stems = mentionStems(MENTION_SLUG)
  if (stems.length === 0) problems.push(`у раздела ${MENTION_SLUG} не вывелись основы для поиска`)
  await mk(200, 'news', 50, 'Праздник в селе Самотестово прошёл') // другое место — не ловится
  await mk(201, 'news', 51, 'Питрау в Нослы: артисты поздравили односельчан')
  await mk(202, 'event', 52, 'Праздничный вечер в Нослы') // афиша — в ленту новостей не идёт

  const mention = await getFeedPage({ institutionSlug: MENTION_SLUG, type: 'news' })
  const mentionTitles = mention.docs.map((doc) => doc.title ?? '')
  const right = mentionTitles.filter((title) => title.includes('Питрау в Нослы')).length
  const wrong = mentionTitles.filter(
    (title) => title.includes('Самотестово') || title.includes('Праздничный вечер'),
  )
  if (right !== 1) problems.push(`в ленте по упоминанию нужная запись встречается ${right} раз, ожидалась 1`)
  if (wrong.length > 0) problems.push(`в ленте по упоминанию лишнее: ${wrong.join(', ')}`)
  for (const doc of mention.docs) {
    if (!mentionedByStems(doc.title, stems)) problems.push(`в ленте заголовок без упоминания: ${doc.title}`)
  }

  // Тот же материал в афише раздела — и в общей ленте не появляется.
  const mentionEvents = await getFeedPage({ institutionSlug: MENTION_SLUG, type: 'event' })
  const eventTitles = mentionEvents.docs.map((doc) => doc.title ?? '')
  if (!eventTitles.includes('Праздничный вечер в Нослы')) {
    problems.push('афиша с упоминанием села не попала в ленту афиши раздела')
  }

  for (const id of createdPostIds) {
    await payload.delete({ collection: 'posts', id, context: ctx })
  }
  await payload.delete({ collection: 'institutions', id: houseId, context: ctx })

  if (problems.length > 0) {
    console.error('::error::проверка ленты не прошла:')
    for (const p of problems) console.error(`  - ${p}`)
    process.exit(1)
  }

  console.log('лента ок: по 20 страницами, порядок по дате, раздел отдаёт только свои, черновик не отдаётся, лента по упоминанию работает')
  process.exit(0)
}

await main()
