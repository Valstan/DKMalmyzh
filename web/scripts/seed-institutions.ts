import config from '@payload-config'
import { getPayload } from 'payload'

import { INSTITUTIONS } from './institutions-data'

// Разовое заведение каталога домов культуры района из scripts/institutions-data.ts.
// Запускается руками: `pnpm payload run scripts/seed-institutions.ts`.
//
// Идемпотентен: существующие карточки узнаются по slug и ОБНОВЛЯЮТСЯ, а не
// создаются заново. Повторный запуск после правки справочника подтянет изменения.
//
// Карточки создаются ЧЕРНОВИКАМИ. Перечень собран машиной по открытым источникам,
// и часть строк требует человеческого решения: у нескольких учреждений по две
// страницы ВК, у нескольких это личная страница вместо сообщества, а у четырёх
// сообщества нет вовсе. Публиковать такое не глядя нельзя — владелец проходит
// карточки в админке и публикует сам.
//
// Что скрипт НЕ трогает у уже существующих карточек: описание, текст раздела,
// адрес, телефон и статус публикации. Их правит редактор, и перезапись затирала
// бы работу руками.

const ctx = { disableRevalidate: true }

const main = async () => {
  const payload = await getPayload({ config })

  let created = 0
  let updated = 0

  for (const item of INSTITUTIONS) {
    const existing = await payload.find({
      collection: 'institutions',
      where: { slug: { equals: item.slug } },
      depth: 0,
      limit: 1,
    })

    const common = {
      title: item.title,
      shortTitle: item.shortTitle,
      settlement: item.settlement,
      slug: item.slug,
      vkGroupUrl: item.vkGroupUrl,
      isHead: Boolean(item.isHead),
    }

    if (existing.docs[0]) {
      await payload.update({
        collection: 'institutions',
        id: existing.docs[0].id,
        context: ctx,
        data: common,
      })
      updated += 1
    } else {
      await payload.create({
        collection: 'institutions',
        context: ctx,
        data: {
          ...common,
          // Заметка сборщика попадает в описание только при СОЗДАНИИ: иначе
          // повторный запуск затирал бы текст, написанный редактором.
          description: item.note,
          _status: 'draft',
        },
      })
      created += 1
    }
  }

  const withVk = INSTITUTIONS.filter((i) => i.vkGroupUrl).length

  console.log(
    `каталог учреждений: создано ${created}, обновлено ${updated} (всего ${INSTITUTIONS.length}, ` +
      `со ссылкой на ВК ${withVk}).`,
  )
  console.log(
    'Карточки заведены черновиками — пройдите их в админке и опубликуйте те, что готовы.',
  )
  process.exit(0)
}

await main()
