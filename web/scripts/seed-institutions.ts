import config from '@payload-config'
import { getPayload } from 'payload'

import { seedInstitutions } from '../src/lib/institutions/seed'

// Локальный запуск заведения каталога домов культуры:
// `pnpm payload run scripts/seed-institutions.ts`.
//
// НА ПРОДЕ этот путь недоступен — туда едет standalone-бандл без payload CLI.
// Там то же самое исполняет служебный маршрут `POST /internal/seed-institutions`
// у работающего приложения. Логика у обоих одна — src/lib/institutions/seed.ts.

const main = async () => {
  const payload = await getPayload({ config })
  const summary = await seedInstitutions(payload)

  console.log(
    `каталог учреждений: создано ${summary.created}, обновлено ${summary.updated} ` +
      `(всего ${summary.total}, со ссылкой на ВК ${summary.withVk}).`,
  )
  console.log('Карточки заведены ЧЕРНОВИКАМИ — пройдите их в админке и опубликуйте готовые.')

  if (summary.needsReview.length > 0) {
    console.log(`\nЧто требует вашего решения (${summary.needsReview.length} из ${summary.total}):`)
    for (const item of summary.needsReview) console.log(`  • ${item.title} — ${item.note}`)
  }

  process.exit(0)
}

await main()
