import config from '@payload-config'
import { getPayload } from 'payload'

import { publishAll } from '../src/lib/sections/publishAll'

// Гейт массовой публикации. Гоняется на живой БД после накатанной миграции:
// свойства держатся на версионировании (черновик → публикация) и связях,
// юнитом их не увидеть.
//
// Проверяется: сухой прогон ничего не меняет, боевой публикует карточки и
// записи, `publishedAt` встаёт по дате оригинала, запись без дома
// пристраивается по владельцу стены и по упоминанию, неоднозначная — нет.

const SLUG_OWNER = 'selftest-publish-all-owner'
const SLUG_TEXT = 'selftest-publish-all-text'

const main = async () => {
  const payload = await getPayload({ config })
  const problems: string[] = []
  const createdPostIds: (number | string)[] = []
  const createdInstitutionIds: (number | string)[] = []
  const ctx = { disableRevalidate: true }

  const trackPost = (id: number | string) => {
    createdPostIds.push(id)
    return id
  }

  // Два дома: один с ownerId стены, второй для текстового матчинга.
  const ownerHouse = await payload.create({
    collection: 'institutions',
    context: ctx,
    data: {
      title: 'Самотестовый ДК (владелец)',
      shortTitle: 'Самотест-В',
      settlement: 'с. Самотестово-В',
      slug: SLUG_OWNER,
      vkSources: [{ url: 'https://vk.com/club999888777', ownerId: -999888777 }],
      _status: 'draft',
    },
  })
  const textHouse = await payload.create({
    collection: 'institutions',
    context: ctx,
    data: {
      title: 'Самотестовый ДК (текст)',
      shortTitle: 'Самотестово-Т',
      settlement: 'с. Самотестово-Т',
      slug: SLUG_TEXT,
      _status: 'draft',
    },
  })
  createdInstitutionIds.push(ownerHouse.id, textHouse.id)

  const mkDraft = async (data: Record<string, unknown>) => {
    const doc = await payload.create({
      collection: 'posts',
      context: ctx,
      draft: true,
      data: { type: 'news', source: 'vk', _status: 'draft', ...data },
    })
    return trackPost(doc.id)
  }

  // 1. Черновик с домом и датой оригинала.
  await mkDraft({
    title: 'Самотест: новость с домом',
    slug: `selftest-pnw-${Date.now()}-1`,
    date: '2026-07-10T10:00:00.000Z',
    institution: ownerHouse.id,
    vkUid: `-999888777_101`,
    sourceUrl: 'https://vk.com/wall-999888777_101',
  })
  // 2. Черновик без дома, но со стены известного дома.
  const ownerlessId = await mkDraft({
    title: 'Самотест: запись со стены',
    slug: `selftest-pnw-${Date.now()}-2`,
    date: '2026-07-11T10:00:00.000Z',
    vkUid: '-999888777_102',
    sourceUrl: 'https://vk.com/wall-999888777_102',
  })
  // 3. Черновик без дома и без владельца, но с упоминанием.
  const textlessId = await mkDraft({
    title: 'Праздник в Самотестово-Т удался',
    slug: `selftest-pnw-${Date.now()}-3`,
    date: '2026-07-12T10:00:00.000Z',
    vkUid: 'selftest-no-owner-103',
    sourceUrl: 'https://vk.com/wall-selftest_103',
  })
  // 4. Опубликованная с чужой датой публикации — ждёт бэкфилла.
  const publishedId = await payload.create({
    collection: 'posts',
    context: ctx,
    data: {
      title: 'Самотест: уже опубликованная',
      slug: `selftest-pnw-${Date.now()}-4`,
      type: 'news',
      source: 'vk',
      date: '2026-06-01T10:00:00.000Z',
      publishedAt: '2026-09-20T10:00:00.000Z',
      institution: ownerHouse.id,
      vkUid: '-999888777_104',
      sourceUrl: 'https://vk.com/wall-999888777_104',
      _status: 'published',
    },
  })
  trackPost(publishedId.id)

  // Сухой прогон: считает, ничего не меняет.
  const dry = await publishAll(payload, { dry: true })
  if (!dry.ok) problems.push('сухой прогон не ok')
  const stillDraft = (await payload.findByID({ collection: 'posts', id: ownerlessId, depth: 0 })) as {
    _status?: string
  }
  if (stillDraft._status !== 'draft') problems.push('сухой прогон изменил запись')

  // Боевой прогон.
  const live = await publishAll(payload, { dry: false })
  if (!live.ok) problems.push(`боевой прогон не ok: ${live.messages.join('; ')}`)

  const read = async (id: number | string) =>
    (await payload.findByID({ collection: 'posts', id, depth: 0 })) as unknown as {
      _status?: string
      publishedAt?: string
      institution?: number | { id: number }
    }

  const withHouse = await read(ownerlessId)
  const byOwner = typeof withHouse.institution === 'number' ? withHouse.institution : withHouse.institution?.id
  if (withHouse._status !== 'published') problems.push('запись со стены не опубликовалась')
  if (byOwner !== ownerHouse.id) problems.push('запись со стены не пристроилась к дому по владельцу')

  const withText = await read(textlessId)
  const byText = typeof withText.institution === 'number' ? withText.institution : withText.institution?.id
  if (byText !== textHouse.id) problems.push('запись с упоминанием не пристроилась к дому по тексту')

  const dated = await read(publishedId.id)
  if (!dated.publishedAt || !dated.publishedAt.startsWith('2026-06-01')) {
    problems.push(`дата уже опубликованной не вернулась к оригиналу: ${dated.publishedAt}`)
  }

  const card = (await payload.findByID({ collection: 'institutions', id: ownerHouse.id, depth: 0 })) as unknown as {
    _status?: string
  }
  if (card._status !== 'published') problems.push('карточка-черновик не опубликовалась')

  // Уборка за собой: чужие данные в CI-БД не оставляем.
  for (const id of createdPostIds) {
    await payload.delete({ collection: 'posts', id, context: ctx })
  }
  for (const id of createdInstitutionIds) {
    await payload.delete({ collection: 'institutions', id, context: ctx })
  }

  if (problems.length > 0) {
    console.error('::error::проверка массовой публикации не прошла:')
    for (const p of problems) console.error(`  - ${p}`)
    process.exit(1)
  }

  console.log('массовая публикация ок: dry не пишет, live публикует, даты — по оригиналу, дома — по владельцу и тексту')
  process.exit(0)
}

await main()
