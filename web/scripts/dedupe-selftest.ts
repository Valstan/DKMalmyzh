import config from '@payload-config'
import { getPayload } from 'payload'

import { dedupePosts } from '../src/lib/posts/dedupe'

// Гейт чистки дублей на живой БД.
//
// Ключевое свойство — НЕ удалять чужое: два поста с одинаковым заголовком, но
// разным текстом, должны остаться оба (у нас таких реальных случаев много —
// «27 августа 2026г.» в Плёсе уходило дважды). Юнитами проверяется разбор
// ключа; здесь проверяется, что Payload удаляет нужное и оставляет лишнее.

const SLUG = 'selftest-dedupe-house'

const main = async () => {
  const payload = await getPayload({ config })
  const problems: string[] = []
  const ctx = { disableRevalidate: true }
  const createdIds: number[] = []

  const institution = await payload.create({
    collection: 'institutions',
    context: ctx,
    data: {
      title: 'Самотестовый ДК (дубли)',
      shortTitle: 'Самотест-дубль',
      settlement: 'с. Самотестово',
      slug: SLUG,
      _status: 'published',
    },
  })

  const mk = async (index: number, title: string, text: string): Promise<number> => {
    const doc = await payload.create({
      collection: 'posts',
      context: ctx,
      data: {
        title,
        slug: `selftest-dedupe-${index}`,
        date: '2026-06-01T10:00:00.000Z',
        type: 'news',
        source: 'manual',
        institution: institution.id,
        vkUid: `-888777666_${7000 + index}`,
        sourceUrl: `https://vk.com/wall-888777666_${7000 + index}`,
        content: {
          root: {
            type: 'root',
            format: '',
            indent: 0,
            version: 1,
            direction: 'ltr',
            children: [
              {
                type: 'paragraph',
                version: 1,
                children: [{ type: 'text', version: 1, text }],
              },
            ],
          },
        },
        _status: 'published',
      },
    })
    createdIds.push(doc.id)
    return doc.id
  }

  // Пара настоящего дубля: разные идентификаторы ВК, разная дата на минуту,
  // одинаковые заголовок и текст.
  const dupA = await mk(1, 'Самотест: концерт в клубе', 'Приглашаем всех на концерт')
  const dupB = await mk(2, 'САМОТЕСТ: КОНЦЕРТ В КЛУБЕ', 'Приглашаем  всех на концерт')
  // Похожий заголовок, но содержание другое — остаётся.
  const other = await mk(3, 'Самотест: концерт в клубе', 'А в этот раз — викторина для детей')
  // Перепост без текста — остаётся: судить не по чему.
  const repost = await mk(4, 'Самотест: запись от 2026-06-01', '')

  const dry = await dedupePosts(payload, { dry: true })
  const stillThere = await payload.count({ collection: 'posts', where: { id: { equals: dupB } } })
  if (stillThere.totalDocs !== 1) problems.push('сухой прогон удалил запись')

  const live = await dedupePosts(payload, { dry: false })
  if (!live.ok) problems.push(`боевой прогон не ok: ${live.messages.join('; ')}`)

  const count = async (id: number) =>
    (await payload.count({ collection: 'posts', where: { id: { equals: id } } })).totalDocs

  if ((await count(dupA)) !== 1) problems.push('исходная копия дубля пропала')
  if ((await count(dupB)) !== 0) problems.push('вторая копия дубля осталась')
  if ((await count(other)) !== 1) problems.push('пост с другим текстом удалён (нельзя)')
  if ((await count(repost)) !== 1) problems.push('перепост без текста удалён (нельзя)')

  for (const id of createdIds) {
    await payload.delete({ collection: 'posts', id, context: ctx }).catch(() => undefined)
  }
  await payload.delete({ collection: 'institutions', id: institution.id, context: ctx })

  if (problems.length > 0) {
    console.error('::error::проверка чистки дублей не прошла:')
    for (const p of problems) console.error(`  - ${p}`)
    process.exit(1)
  }

  console.log(
    `чистка дублей ок: сухой прогон не пишет, дубль сносит, одинаковый заголовок с разным текстом оставляет (групп было ${dry.groups})`,
  )
  process.exit(0)
}

await main()
