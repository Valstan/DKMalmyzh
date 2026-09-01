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
// Что скрипт НЕ трогает: описание, текст раздела, адрес, телефон и статус
// публикации. Их пишет редактор, и перезапись затирала бы работу руками.
//
// Заметки сборщика («у этого ДК две страницы», «это личный профиль») в карточку
// НЕ кладутся: `description` — публичный текст, он виден на портале, и служебная
// пометка про вторую страницу ВК смотрелась бы там как часть описания
// учреждения. Заметки печатаются списком в конце — как памятка на один проход
// review; сами они живут в scripts/institutions-data.ts.

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
        data: { ...common, _status: 'draft' },
      })
      created += 1
    }
  }

  const withVk = INSTITUTIONS.filter((i) => i.vkGroupUrl).length

  console.log(
    `каталог учреждений: создано ${created}, обновлено ${updated} (всего ${INSTITUTIONS.length}, ` +
      `со ссылкой на ВК ${withVk}).`,
  )
  console.log('Карточки заведены ЧЕРНОВИКАМИ — пройдите их в админке и опубликуйте готовые.')

  const notes = INSTITUTIONS.filter((i) => i.note)
  if (notes.length > 0) {
    console.log(`
Что требует вашего решения (${notes.length} из ${INSTITUTIONS.length}):`)
    for (const item of notes) console.log(`  • ${item.shortTitle} — ${item.note}`)
  }
  process.exit(0)
}

await main()
