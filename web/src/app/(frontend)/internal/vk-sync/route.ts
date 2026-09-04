import config from '@payload-config'
import { getPayload } from 'payload'

import { guardInternal } from '../../../../lib/internal/auth'
import { readGatewayConfig } from '../../../../lib/vk/api'
import { runVkSync } from '../../../../lib/vk/sync'

// Точка запуска импорта из ВК изнутри уже работающего приложения.
//
// Почему не отдельный процесс на боксе: на прод едет standalone-бандл, payload
// CLI в него не входит, а фото надо писать в постоянный каталог Media, который
// живёт только здесь. Приложение и так подключено к БД и к Media — дешевле
// дёрнуть его локальным запросом, чем везти на бокс второй рантайм.
//
// Дёргает таймер systemd (deploy/dkmalmyzh-vk-sync.timer) запросом на
// 127.0.0.1:3005; вручную — воркфлоу `internal-run.yml`. Охрана общая с
// остальными `/internal/*` — см. lib/internal/auth.ts.

export const dynamic = 'force-dynamic'
export const revalidate = 0

const WALL_COUNT = Number(process.env.VK_SYNC_COUNT || 20)

// По умолчанию импорт кладёт ЧЕРНОВИКИ: материалы чужих учреждений появлялись бы
// на портале без участия редакции. VK_SYNC_PUBLISH=1 включается, когда владелец
// убедится в качестве выборки.
const PUBLISH = process.env.VK_SYNC_PUBLISH === '1'

// Один прогон за раз. Первый импорт 04.09 шёл дольше получаса, таймер стартовал
// второй поверх него, и оба стали писать одни и те же записи: второй упирался в
// уникальность vkUid и имени файла в Media, а в журнале это выглядело как
// «с ошибкой 15» без объяснения. Замок в памяти процесса достаточен: на проде
// один экземпляр приложения (standalone, один Node-процесс).
let running: { since: number } | null = null

export async function POST(request: Request): Promise<Response> {
  const denied = guardInternal(request, 'импорт из ВК')
  if (denied) return denied.response

  if (running) {
    const minutes = Math.round((Date.now() - running.since) / 60000)
    return Response.json({ error: `прогон уже идёт (${minutes} мин)` }, { status: 409 })
  }

  // Ходим в ВК только через шлюз SARAFAN (pool #062) — прямых токенов у нас нет
  // и быть не должно. Нет адреса или ключа шлюза — импорт выключен.
  const gateway = readGatewayConfig(process.env)
  if (!gateway) {
    return Response.json(
      { error: 'SARAFAN_GATEWAY_URL/SARAFAN_GATEWAY_KEY не заданы' },
      { status: 503 },
    )
  }

  const payload = await getPayload({ config })

  running = { since: Date.now() }
  try {
    const summary = await runVkSync(payload, {
      gateway,
      publish: PUBLISH,
      wallCount: WALL_COUNT,
      onlySlug: new URL(request.url).searchParams.get('slug') || undefined,
      log: (message) => payload.logger.info(`[vk-sync] ${message}`),
    })
    return Response.json({ ok: true, ...summary })
  } catch (err) {
    payload.logger.error(`[vk-sync] прогон не завершился: ${(err as Error)?.message ?? err}`)
    return Response.json({ error: 'прогон не завершился' }, { status: 500 })
  } finally {
    running = null
  }
}
