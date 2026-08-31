import config from '@payload-config'
import { getPayload } from 'payload'

import type { VkWallItem } from '../src/lib/vk/api'
import { importWallItems } from '../src/lib/vk/import'

// Гейт импорта из ВК: прогон ядра на подставных записях, без токена и без сети.
//
// Проверяется главное свойство синхронизации — ИДЕМПОТЕНТНОСТЬ. Таймер на боксе
// ходит каждые полчаса по одним и тем же стенам; импорт, который на втором
// заходе создаёт дубли, забивает ленту района за сутки. Свойство держится на
// уникальном `vkUid`, то есть на схеме, — значит проверять его надо на живой
// БД после накатанной миграции, а не юнитом.
//
// Сеть подменяется: fetch отдаёт крошечный PNG на любой адрес. Это не мок ради
// мока — путь загрузки фото в Media настоящий, с записью файла и превью.

const ctx = { disableRevalidate: true }

// 1×1 PNG. Настоящие байты, а не заглушка: sharp обязан суметь его прочитать,
// иначе проверялся бы не тот путь.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

// Подставной owner_id — выдуманный, не боевой и не из документации ВК: пример
// вендора лежит в allowlist сканера секретов и оставил бы гейт зелёным там,
// где он должен краснеть (G258).
const OWNER_ID = -900000001

const WALL: VkWallItem[] = [
  {
    id: 101,
    date: 1767225600,
    text: 'Концерт ко Дню села\n\nНачало в 18:00, подробности https://example.org/afisha',
    attachments: [
      { type: 'photo', photo: { sizes: [{ url: 'https://example.invalid/p1.jpg', width: 1280, height: 960 }] } },
      { type: 'photo', photo: { sizes: [{ url: 'https://example.invalid/p2.jpg', width: 800, height: 600 }] } },
    ],
  },
  // Репост без своего текста: текст и фото должны приехать из оригинала.
  {
    id: 102,
    date: 1767312000,
    text: '',
    copy_history: [
      {
        id: 55,
        text: 'Афиша выходных в районе',
        attachments: [
          { type: 'photo', photo: { sizes: [{ url: 'https://example.invalid/p3.jpg', width: 604, height: 453 }] } },
        ],
      },
    ],
  },
  // Закреп: не должен импортироваться вовсе — иначе всплывал бы наверх ленты
  // как свежий на каждом прогоне.
  { id: 103, date: 1767398400, text: 'Закреплённое объявление', is_pinned: 1 },
  // Реклама: тоже мимо.
  { id: 104, date: 1767398400, text: 'Реклама', marked_as_ads: 1 },
]

const main = async () => {
  const payload = await getPayload({ config })
  const problems: string[] = []

  // Сеть подменяем только на время прогона и возвращаем обратно: скрипт живёт в
  // одном процессе с Payload, и оставленный патч поломал бы всё, что после.
  const realFetch = globalThis.fetch
  globalThis.fetch = (async () =>
    new Response(Buffer.from(PNG_BASE64, 'base64'), {
      status: 200,
      headers: { 'content-type': 'image/png' },
    })) as typeof globalThis.fetch

  try {
    const institution = await payload.create({
      collection: 'institutions',
      context: ctx,
      data: {
        title: 'CI: дом культуры для проверки импорта',
        slug: 'ci-vk-import',
        shortTitle: 'CI-ВК',
        vkGroupUrl: 'https://example.invalid/ci',
        _status: 'published',
      },
    })

    const params = {
      institutionId: institution.id,
      ownerId: OWNER_ID,
      label: 'CI-ВК',
      items: WALL,
      publish: true,
      onProblem: (m: string) => problems.push(`импорт сообщил о проблеме: ${m}`),
    }

    const first = await importWallItems(payload, params)
    console.log(`первый прогон: создано ${first.created}, пропущено ${first.skipped}`)

    if (first.created !== 2) problems.push(`первый прогон создал ${first.created}, ожидалось 2`)
    if (first.failed !== 0) problems.push(`первый прогон: ошибок ${first.failed}`)

    const afterFirst = await payload.count({
      collection: 'posts',
      where: { source: { equals: 'vk' } },
    })

    // Тот же ввод второй раз — ровно то, что делает таймер на боксе.
    const second = await importWallItems(payload, params)
    console.log(`второй прогон: создано ${second.created}, пропущено ${second.skipped}`)

    if (second.created !== 0) problems.push(`повторный прогон создал ${second.created} — дубли`)
    if (second.skipped !== 2) problems.push(`повторный прогон пропустил ${second.skipped}, ожидалось 2`)

    const afterSecond = await payload.count({
      collection: 'posts',
      where: { source: { equals: 'vk' } },
    })
    if (afterFirst.totalDocs !== afterSecond.totalDocs) {
      problems.push(
        `число импортированных записей изменилось: ${afterFirst.totalDocs} → ${afterSecond.totalDocs}`,
      )
    }

    // Разбор содержимого: связь, обложка, галерея, репост, отбор записей.
    const imported = await payload.find({
      collection: 'posts',
      where: { vkUid: { like: `${OWNER_ID}_` } },
      depth: 0,
      limit: 10,
      sort: 'date',
    })

    if (imported.totalDocs !== 2) problems.push(`импортировано ${imported.totalDocs}, ожидалось 2`)

    const [concert, repost] = imported.docs

    if (concert?.title !== 'Концерт ко Дню села')
      problems.push(`заголовок взят неверно: «${concert?.title}»`)
    if (!concert?.cover) problems.push('обложка не проставилась — фото не доехало в Media')
    if ((concert?.gallery ?? []).length !== 1)
      problems.push(`в галерее ${(concert?.gallery ?? []).length} фото, ожидалось 1`)
    if (concert?.source !== 'vk') problems.push('источник записи не «vk»')
    if (concert?.type !== 'news') problems.push('импорт проставил вид записи сам — не должен')
    if (!concert?.institution) problems.push('запись не связана с домом культуры')

    // Текст репоста должен приехать из оригинала, иначе запись пустая.
    if (repost?.title !== 'Афиша выходных в районе')
      problems.push(`репост потерял текст оригинала: «${repost?.title}»`)
    if (!repost?.cover) problems.push('репост потерял фото оригинала')

    const pinned = await payload.count({
      collection: 'posts',
      where: { title: { like: 'Закреплённое' } },
    })
    if (pinned.totalDocs !== 0) problems.push('закреплённая запись импортировалась')

    // Содержимое должно быть валидным lexical: ссылка в тексте — узлом link,
    // иначе на странице она останется голым текстом.
    const content = concert?.content as { root?: { children?: unknown[] } } | undefined
    if (!Array.isArray(content?.root?.children) || content.root.children.length === 0) {
      problems.push('content не похож на lexical-документ')
    }
  } finally {
    globalThis.fetch = realFetch
  }

  if (problems.length > 0) {
    console.error('::error::проверка импорта из ВК не прошла:')
    for (const p of problems) console.error(`  - ${p}`)
    process.exit(1)
  }

  console.log('импорт из ВК: идемпотентность, обложка с галереей, репост и отбор записей — ок')
  process.exit(0)
}

await main()
