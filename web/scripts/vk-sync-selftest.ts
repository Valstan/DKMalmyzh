import config from '@payload-config'
import { getPayload } from 'payload'

import type { VkWallItem } from '../src/lib/vk/api'
import { importWallItems } from '../src/lib/vk/import'
import { runVkSync } from '../src/lib/vk/sync'

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
        vkSources: [{ url: 'https://example.invalid/ci' }],
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

  await checkMultiSource(payload, problems)

  if (problems.length > 0) {
    console.error('::error::проверка импорта из ВК не прошла:')
    for (const p of problems) console.error(`  - ${p}`)
    process.exit(1)
  }

  console.log('импорт из ВК: идемпотентность, обложка с галереей, репост и отбор записей — ок')
  process.exit(0)
}

// Обход НЕСКОЛЬКИХ источников у одного учреждения — то, ради чего модель
// перестала быть «одна ссылка на дом культуры»: РЦКД печатает и в группе, и на
// личной странице, а у пяти сельских ДК рядом с действующей страницей живёт
// прежняя. Проверяется на подменённом шлюзе: сети и ключа тут нет.
async function checkMultiSource(
  payload: Awaited<ReturnType<typeof getPayload>>,
  problems: string[],
): Promise<void> {
  const OK_A = -900000011
  const OK_B = -900000012
  const BROKEN = -900000013

  const walls: Record<number, VkWallItem[]> = {
    [OK_A]: [{ id: 1, date: 1767225600, text: 'Из группы' }],
    [OK_B]: [{ id: 2, date: 1767312000, text: 'С личной страницы' }],
  }

  const realFetch = globalThis.fetch
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (!url.includes('/api/gateway/call')) {
      return new Response(Buffer.from(PNG_BASE64, 'base64'), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      })
    }
    const body = JSON.parse(String(init?.body ?? '{}')) as {
      method?: string
      params?: { owner_id?: number; screen_name?: string }
    }
    if (body.method === 'utils.resolveScreenName') {
      return json({ ok: true, response: { type: 'group', object_id: -OK_B } })
    }
    const owner = body.params?.owner_id ?? 0
    // Одна из стен «закрыта»: доменная ошибка ВК приезжает с HTTP 200 и
    // ok: false — ровно так, как её отдаёт настоящий шлюз.
    if (owner === BROKEN) {
      return json({ ok: false, error: { error_code: 15, error_msg: 'Access denied' } })
    }
    return json({ ok: true, response: { count: walls[owner]?.length ?? 0, items: walls[owner] ?? [] } })
  }) as typeof globalThis.fetch

  try {
    await payload.create({
      collection: 'institutions',
      context: ctx,
      data: {
        title: 'CI: дом культуры с несколькими источниками',
        slug: 'ci-multi',
        shortTitle: 'CI-мульти',
        vkSources: [
          // числовой адрес — разбирается локально, шлюз не дёргается
          { url: `https://vk.com/club${Math.abs(OK_A)}` },
          // короткое имя — уходит в resolveScreenName, owner_id должен осесть в карточке
          { url: 'https://vk.com/ci_short_name' },
          // заведомо недоступная стена: не должна ронять остальные
          { url: `https://vk.com/club${Math.abs(BROKEN)}` },
        ],
        _status: 'published',
      },
    })

    const summary = await runVkSync(payload, {
      gateway: { url: 'https://gateway.invalid', key: 'not-a-real-key' },
      publish: true,
      wallCount: 10,
      onlySlug: 'ci-multi',
    })

    console.log(
      `мультиисточник: стен прочитано ${summary.sources}, создано ${summary.created}, ` +
        `с ошибкой ${summary.failed}`,
    )

    if (summary.sources !== 2)
      problems.push(`прочитано стен ${summary.sources}, ожидалось 2 (третья закрыта)`)
    if (summary.created !== 2)
      problems.push(`создано ${summary.created} записей, ожидалось 2 — по одной с каждой стены`)
    if (summary.failed !== 1)
      problems.push(`ошибок ${summary.failed}, ожидалась 1 (закрытая стена)`)

    const card = await payload.find({
      collection: 'institutions',
      where: { slug: { equals: 'ci-multi' } },
      depth: 0,
      limit: 1,
      draft: true,
    })
    const sources = card.docs[0]?.vkSources ?? []
    const resolved = sources.find((s) => s.url === 'https://vk.com/ci_short_name')
    if (resolved?.ownerId !== OK_B)
      problems.push(`owner_id короткого имени не закэширован (${resolved?.ownerId})`)

    // Обе стены дали записи одному и тому же учреждению — это и есть смысл
    // нескольких источников.
    const posts = await payload.find({
      collection: 'posts',
      where: { institution: { equals: card.docs[0]?.id } },
      depth: 0,
      limit: 10,
    })
    if (posts.totalDocs !== 2)
      problems.push(`у учреждения ${posts.totalDocs} записей, ожидалось 2 из двух источников`)
  } finally {
    globalThis.fetch = realFetch
  }
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

await main()
