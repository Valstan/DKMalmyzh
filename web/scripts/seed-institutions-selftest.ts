import config from '@payload-config'
import { getPayload } from 'payload'

import { INSTITUTIONS } from '../src/lib/institutions/catalog'
import { seedInstitutions } from '../src/lib/institutions/seed'

// Гейт заведения каталога учреждений. Гоняется на живой БД после накатанной
// миграции — свойства, которые тут проверяются, держатся на схеме и на данных,
// юнитом их не увидеть.
//
// Что именно проверяется и почему:
//
// 1. ИДЕМПОТЕНТНОСТЬ. Каталог заводится повторно каждый раз, когда в справочник
//    добавляется найденное сообщество. Прогон, создающий дубли, даёт району два
//    раздела на один дом культуры.
// 2. ЗАМЕТКИ СБОРЩИКА НЕ УХОДЯТ В `description`. Это публичное поле: пометка
//    «у этого ДК две страницы ВК» читалась бы на портале как описание
//    учреждения. Ошибка уже была допущена и исправлена — тест держит границу.
// 3. ЧЕРНОВИКИ. Перечень собран машиной; публиковать его не глядя нельзя.
// 4. ПРАВКИ РЕДАКТОРА ПЕРЕЖИВАЮТ ПОВТОРНЫЙ ПРОГОН. Описание и текст раздела
//    пишет человек, и затирать их обновлением справочника недопустимо.

const main = async () => {
  const payload = await getPayload({ config })
  const problems: string[] = []

  const first = await seedInstitutions(payload)
  console.log(`первый прогон: создано ${first.created}, обновлено ${first.updated}`)

  if (first.created !== INSTITUTIONS.length)
    problems.push(`создано ${first.created}, ожидалось ${INSTITUTIONS.length}`)
  if (first.needsReview.length === 0)
    problems.push('ни одна карточка не помечена как требующая решения — заметки потерялись')

  // Правка редактора: её обязан пережить следующий прогон.
  const head = await payload.find({
    collection: 'institutions',
    where: { and: [{ isHead: { equals: true } }, { slug: { in: INSTITUTIONS.map((i) => i.slug) } }] },
    depth: 0,
    limit: 1,
    draft: true,
  })
  const headDoc = head.docs[0]
  if (!headDoc) {
    problems.push('головное учреждение не заведено')
  } else {
    await payload.update({
      collection: 'institutions',
      id: headDoc.id,
      context: { disableRevalidate: true },
      data: { description: 'Текст, написанный редактором' },
    })
  }

  const second = await seedInstitutions(payload)
  console.log(`второй прогон: создано ${second.created}, обновлено ${second.updated}`)

  if (second.created !== 0) problems.push(`повторный прогон создал ${second.created} — дубли`)
  if (second.updated !== INSTITUTIONS.length)
    problems.push(`повторный прогон обновил ${second.updated}, ожидалось ${INSTITUTIONS.length}`)

  // Выборка ограничена slug'ами каталога: в той же таблице живёт учреждение из
  // сида CI, и утверждения «сколько всего» про него были бы неверны — проверять
  // надо то, что завёл этот скрипт, а не всё содержимое базы.
  const slugs = INSTITUTIONS.map((i) => i.slug)
  const found = await payload.find({
    collection: 'institutions',
    where: { slug: { in: slugs } },
    depth: 0,
    limit: 500,
    pagination: false,
    draft: true,
  })
  const all = found

  if (all.totalDocs !== INSTITUTIONS.length)
    problems.push(`заведено ${all.totalDocs} учреждений каталога, ожидалось ${INSTITUTIONS.length}`)

  const published = all.docs.filter((d) => d._status === 'published')
  if (published.length > 0)
    problems.push(`${published.length} карточек опубликовано — каталог обязан приезжать черновиком`)

  // Заметки сборщика не должны совпасть ни с одним описанием: это и есть
  // проверка, что служебный текст не утёк в публичное поле.
  const notes = new Set(INSTITUTIONS.map((i) => i.note).filter(Boolean) as string[])
  for (const doc of all.docs) {
    if (doc.description && notes.has(doc.description)) {
      problems.push(`заметка сборщика попала в публичное описание «${doc.title}»`)
    }
  }

  const headAfter = all.docs.find((d) => d.id === headDoc?.id)
  if (headAfter && headAfter.description !== 'Текст, написанный редактором') {
    problems.push('повторный прогон затёр описание, написанное редактором')
  }

  const heads = all.docs.filter((d) => d.isHead)
  if (heads.length !== 1) problems.push(`головных учреждений ${heads.length}, ожидалось 1`)

  const withVk = all.docs.filter((d) => (d.vkSources ?? []).length > 0).length
  if (withVk !== first.withVk) problems.push(`со ссылками на ВК ${withVk}, ожидалось ${first.withVk}`)

  // Источников больше, чем учреждений: у РЦКД и пяти сельских ДК их по два.
  // Проверка ловит потерю второго адреса при записи массива.
  const sources = all.docs.reduce((n, d) => n + (d.vkSources ?? []).length, 0)
  if (sources !== first.sources)
    problems.push(`источников в базе ${sources}, ожидалось ${first.sources}`)
  if (sources <= withVk) problems.push('ни у одного учреждения не сохранилось двух источников')

  if (problems.length > 0) {
    console.error('::error::проверка каталога учреждений не прошла:')
    for (const p of problems) console.error(`  - ${p}`)
    process.exit(1)
  }

  console.log(
    `каталог ок: ${all.totalDocs} учреждений черновиками, со ссылками на ВК ${withVk} ` +
      `(источников ${sources}), ` +
      `требуют решения ${first.needsReview.length}; повторный прогон не создал дублей ` +
      'и не затёр правку редактора',
  )
  process.exit(0)
}

await main()
