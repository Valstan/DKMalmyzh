import type { getPayload } from 'payload'

import type { GatewayConfig, VkWallItem } from './api'
import { resolveOwnerId, wallGet, VkError, GATEWAY_PACE_MS } from './api'
import { importWallItems } from './import'
import { parseVkTarget } from './screenName'

// Обход всех учреждений со ссылкой на ВК. Живёт в src/lib, а не в scripts/,
// потому что запускается ИЗ ПРИЛОЖЕНИЯ: на прод едет standalone-бандл, payload
// CLI в него не входит (см. README миграций), а фото надо писать в тот самый
// каталог Media, который есть только на боксе. Поэтому синхронизацию дёргает
// таймер systemd через локальный HTTP-запрос к уже работающему сайту.
//
// В ВК ходим только через шлюз SARAFAN — см. шапку api.ts.

type Payload = Awaited<ReturnType<typeof getPayload>>

export type SyncSummary = {
  institutions: number
  /** Стен, реально прочитанных за прогон: у части учреждений их несколько. */
  sources: number
  created: number
  skipped: number
  failed: number
  messages: string[]
}

export type SyncOptions = {
  gateway: GatewayConfig
  publish: boolean
  wallCount: number
  /** Ограничитель для ручного прогона по одному учреждению. */
  onlySlug?: string
  log?: (message: string) => void
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Один повтор после 429: шлюз держит общий бюджет на всех потребителей, и
// упереться в него — штатное событие, а не поломка. Ждём ровно столько, сколько
// он просит, но не дольше двух минут: таймер придёт снова через полчаса, и
// висеть до бесконечности незачем.
const MAX_RETRY_WAIT_SEC = 120

async function withGatewayRetry<T>(
  fn: () => Promise<T>,
  say: (message: string) => void,
  what: string,
): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof VkError && err.code === 429 && err.retryAfterSec !== undefined) {
      const wait = Math.min(err.retryAfterSec, MAX_RETRY_WAIT_SEC)
      say(`${what}: квота шлюза исчерпана, жду ${wait} с и пробую ещё раз`)
      await sleep(wait * 1000)
      return fn()
    }
    throw err
  }
}

export async function runVkSync(payload: Payload, options: SyncOptions): Promise<SyncSummary> {
  const { gateway, publish, wallCount, onlySlug, log } = options
  const summary: SyncSummary = {
    institutions: 0,
    sources: 0,
    created: 0,
    skipped: 0,
    failed: 0,
    messages: [],
  }

  const say = (message: string) => {
    summary.messages.push(message)
    log?.(message)
  }

  const institutions = await payload.find({
    collection: 'institutions',
    where: onlySlug ? { slug: { equals: onlySlug } } : {},
    depth: 0,
    limit: 500,
    pagination: false,
  })

  for (const institution of institutions.docs) {
    const label = institution.shortTitle || institution.title || `#${institution.id}`
    const sources = Array.isArray(institution.vkSources) ? institution.vkSources : []

    if (sources.length === 0) continue

    // owner_id, определённые за этот прогон, складываем и записываем в карточку
    // ОДНИМ обновлением: по обновлению на источник плодило бы версии документа
    // на каждый прогон таймера.
    // Карта «ссылка -> определённый owner_id». Именно карта, а не список
    // успешных: список подменял бы весь массив источников, и ссылка, которую в
    // этот прогон не удалось разрезолвить (429 шлюза, переименованное
    // сообщество, неразобранный адрес), ИСЧЕЗАЛА бы из карточки учреждения
    // насовсем. Источники — данные владельца, импорт их не редактирует.
    const resolvedIds = new Map<string, number>()
    let touched = false

    for (const source of sources) {
      const url = typeof source?.url === 'string' ? source.url : ''
      const cached = typeof source?.ownerId === 'number' ? source.ownerId : null
      const target = parseVkTarget(url)

      if (!target) {
        say(`${label}: ссылка «${url}» не разобрана — пропуск`)
        continue
      }

      let ownerId: number | null = null
      try {
        if (target.kind === 'owner') {
          // Числовой адрес разбирается локально — вызов шлюза не тратим.
          ownerId = target.ownerId
        } else if (cached && cached !== 0) {
          // Короткое имя уже разрешали — второй раз в шлюз не ходим.
          ownerId = cached
        } else {
          ownerId = await withGatewayRetry(
            () => resolveOwnerId(target.screenName, gateway),
            say,
            label,
          )
          await sleep(GATEWAY_PACE_MS)
        }
      } catch (err) {
        say(`${label} (${url}): owner_id не определён — ${describeVkError(err)}`)
        summary.failed += 1
        continue
      }

      if (!ownerId) {
        say(`${label} (${url}): owner_id не определился — пропуск`)
        continue
      }

      resolvedIds.set(url, ownerId)
      if (cached !== ownerId) touched = true

      let items: VkWallItem[]
      try {
        const wall = await withGatewayRetry(() => wallGet(ownerId, wallCount, gateway), say, label)
        items = wall.items ?? []
        await sleep(GATEWAY_PACE_MS)
      } catch (err) {
        // Закрытая стена и удалённое сообщество — обычное дело для сельских
        // групп, а у части учреждений вторая ссылка ведёт на давно брошенную
        // страницу. Один недоступный источник не должен ронять ни остальные
        // источники этого же ДК, ни импорт других учреждений.
        say(`${label} (${url}): стена недоступна — ${describeVkError(err)}`)
        summary.failed += 1
        continue
      }

      const stats = await importWallItems(payload, {
        institutionId: institution.id,
        ownerId,
        label,
        items,
        publish,
        onProblem: (message) => say(`${label}: ${message}`),
      })

      summary.created += stats.created
      summary.skipped += stats.skipped
      summary.failed += stats.failed
      summary.sources += 1

      say(
        `${label} (${url}): со стены ${items.length}, создано ${stats.created}, ` +
          `уже было ${stats.skipped}, с ошибкой ${stats.failed}`,
      )
    }

    summary.institutions += 1

    // Кэшируем owner_id в карточке: следующий прогон обойдётся без
    // resolveScreenName, а редактор видит, чью стену читает импорт.
    if (touched && resolvedIds.size > 0) {
      // Обходим ИСХОДНЫЙ список: каждый источник остаётся на месте, меняется
      // только кэш owner_id и только там, где он определился.
      const nextSources = sources.map((source) => {
        const url = typeof source?.url === 'string' ? source.url : ''
        const known = resolvedIds.get(url)
        const previous = typeof source?.ownerId === 'number' ? source.ownerId : undefined
        return { url, ownerId: known ?? previous }
      })

      await payload.update({
        collection: 'institutions',
        id: institution.id,
        context: { disableRevalidate: true },
        data: { vkSources: nextSources },
      })
    }
  }

  return summary
}

// Сообщение собирается из полей ошибки, а не из тела запроса: в заголовке к
// шлюзу лежит ключ проекта, и наивный дамп утащил бы его в журнал прода.
export function describeVkError(err: unknown): string {
  if (err instanceof VkError) return `шлюз/ВК ${err.code}: ${err.message}`
  if (err instanceof Error) return err.message
  return 'неизвестная ошибка'
}
