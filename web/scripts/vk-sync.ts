import config from '@payload-config'
import { getPayload } from 'payload'

import { readVkToken } from '../src/lib/vk/api'
import { runVkSync } from '../src/lib/vk/sync'

// Ручной прогон импорта из ВК — для машины разработчика и для разового
// исторического захода, когда удобнее видеть вывод в терминале.
//
// НА ПРОДЕ этот путь недоступен: туда едет standalone-бандл без payload CLI.
// Там импорт запускает таймер systemd, дёргая маршрут /internal/vk-sync у уже
// работающего приложения. Логика у обоих одна — src/lib/vk/sync.ts.
//
// Полезные переменные: VK_SYNC_COUNT (глубина выборки), VK_SYNC_PUBLISH=1
// (публиковать сразу), VK_SYNC_ONLY=<slug> (одно учреждение).

const main = async () => {
  const token = readVkToken(process.env)
  if (!token) {
    console.error('VK_SERVICE_TOKEN не задан — синхронизировать нечем')
    process.exit(1)
  }

  const payload = await getPayload({ config })

  const summary = await runVkSync(payload, {
    token,
    publish: process.env.VK_SYNC_PUBLISH === '1',
    wallCount: Number(process.env.VK_SYNC_COUNT || 20),
    onlySlug: process.env.VK_SYNC_ONLY || undefined,
    log: (message) => console.log(`  ${message}`),
  })

  console.log(
    `синхронизация завершена: учреждений ${summary.institutions}, создано ${summary.created}, ` +
      `пропущено ${summary.skipped}, с ошибкой ${summary.failed}`,
  )
  process.exit(summary.failed > 0 ? 1 : 0)
}

await main()
