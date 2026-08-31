import config from '@payload-config'
import { getPayload } from 'payload'

// Минимальный сид для гейта CI. Запускается `pnpm payload run scripts/seed-ci.ts`
// ПОСЛЕ наката миграций и ДО сборки, на эфемерной БД раннера. На прод не едет.
//
// Зачем он вообще нужен, если гейт и так собирается:
//
// 1. Пререндер на пустой БД не выполняет ни одной ветки рендера с данными —
//    ошибки на реальных документах в сборке не ловятся (класс G230).
// 2. Схема, накатанная миграцией, проверяется только тем, что через неё
//    реально ходит. Поэтому сид обязан **обновлять уже существующий документ**,
//    а не только создавать: у Калинино ручная миграция потеряла колонки, весь
//    импорт был созданием, всё было зелёным, и дыра прожила 18 дней (G231).
//    Создание и обновление ходят по разным таблицам — проверяем оба пути.
//
// Документы публикуются явным `_status: 'published'`: у коллекций включены
// drafts, и без этого поля документ остаётся черновиком, а публичный рендер его
// не видит (G223 — состояние берётся из `data._status`, а не из `draft: false`).

const ctx = { disableRevalidate: true }

const main = async () => {
  const payload = await getPayload({ config })

  const page = await payload.create({
    collection: 'pages',
    context: ctx,
    data: {
      title: 'CI: тестовая страница',
      _status: 'published',
    },
  })

  console.log(`шаг 1/3 — создание страницы: ок (id ${page.id})`)

  const post = await payload.create({
    collection: 'posts',
    context: ctx,
    data: {
      title: 'CI: тестовая новость',
      date: '2026-01-01T00:00:00.000Z',
      category: 'CI',
      _status: 'published',
    },
  })

  console.log(`шаг 2/3 — создание новости: ок (id ${post.id})`)

  // Путь ОБНОВЛЕНИЯ — то, ради чего сид и стоит в гейте.
  const updated = await payload.update({
    collection: 'posts',
    id: post.id,
    context: ctx,
    data: {
      title: 'CI: тестовая новость (обновлена)',
      _status: 'published',
    },
  })

  console.log('шаг 3/3 — обновление существующей новости: ок')

  // Проверяем результат фактом, а не отсутствием исключения: сид, который
  // «отработал» и ничего не создал, оставил бы пререндер таким же пустым.
  const pages = await payload.count({ collection: 'pages' })
  const posts = await payload.count({ collection: 'posts' })
  const published = await payload.find({
    collection: 'posts',
    where: { _status: { equals: 'published' } },
    limit: 0,
  })

  const problems: string[] = []
  if (pages.totalDocs < 1) problems.push(`страниц создано ${pages.totalDocs}, ожидалась минимум 1`)
  if (posts.totalDocs < 1) problems.push(`новостей создано ${posts.totalDocs}, ожидалась минимум 1`)
  if (published.totalDocs < 1) problems.push('ни одна новость не опубликована — пререндер снова пустой')
  if (!updated.title.includes('обновлена')) problems.push('обновление не сохранилось')

  if (problems.length > 0) {
    console.error('::error::сид отработал, но результат не тот:')
    for (const p of problems) console.error(`  - ${p}`)
    process.exit(1)
  }

  console.log(
    `сид ок: страниц ${pages.totalDocs}, новостей ${posts.totalDocs} (опубликовано ${published.totalDocs}); ` +
      `создание и обновление прошли, page id ${page.id}`,
  )
  process.exit(0)
}

await main()
