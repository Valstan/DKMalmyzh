import type { getPayload } from 'payload'

import type { VkWallItem } from './api'
import { resolveOwnerId, wallGet, VkError, VK_RATE_LIMIT_MS } from './api'
import { importWallItems } from './import'
import { parseVkTarget } from './screenName'

// Обход всех учреждений со ссылкой на ВК. Живёт в src/lib, а не в scripts/,
// потому что запускается ИЗ ПРИЛОЖЕНИЯ: на прод едет standalone-бандл, payload
// CLI в него не входит (см. README миграций), а фото надо писать в тот самый
// каталог Media, который есть только на боксе. Поэтому синхронизацию дёргает
// таймер systemd через локальный HTTP-запрос к уже работающему сайту.

type Payload = Awaited<ReturnType<typeof getPayload>>

export type SyncSummary = {
  institutions: number
  created: number
  skipped: number
  failed: number
  messages: string[]
}

export type SyncOptions = {
  token: string
  publish: boolean
  wallCount: number
  /** Ограничитель для ручного прогона по одному учреждению. */
  onlySlug?: string
  log?: (message: string) => void
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function runVkSync(payload: Payload, options: SyncOptions): Promise<SyncSummary> {
  const { token, publish, wallCount, onlySlug, log } = options
  const summary: SyncSummary = { institutions: 0, created: 0, skipped: 0, failed: 0, messages: [] }

  const say = (message: string) => {
    summary.messages.push(message)
    log?.(message)
  }

  const institutions = await payload.find({
    collection: 'institutions',
    where: onlySlug
      ? { and: [{ vkGroupUrl: { exists: true } }, { slug: { equals: onlySlug } }] }
      : { vkGroupUrl: { exists: true } },
    depth: 0,
    limit: 500,
    pagination: false,
  })

  for (const institution of institutions.docs) {
    const label = institution.shortTitle || institution.title || `#${institution.id}`
    const target = parseVkTarget(institution.vkGroupUrl)

    if (!target) {
      say(`${label}: ссылка на ВК не разобрана — пропуск`)
      continue
    }

    let ownerId: number | null = null
    try {
      if (target.kind === 'owner') {
        ownerId = target.ownerId
      } else if (typeof institution.vkOwnerId === 'number' && institution.vkOwnerId !== 0) {
        // Короткое имя уже разрешали — второй раз в API не ходим.
        ownerId = institution.vkOwnerId
      } else {
        ownerId = await resolveOwnerId(target.screenName, token)
        await sleep(VK_RATE_LIMIT_MS)
      }
    } catch (err) {
      say(`${label}: owner_id не определён — ${describeVkError(err)}`)
      summary.failed += 1
      continue
    }

    if (!ownerId) {
      say(`${label}: owner_id не определился — пропуск`)
      continue
    }

    // Кэшируем owner_id в карточке: следующий прогон обойдётся без
    // resolveScreenName, а редактор видит, чью стену читает импорт.
    if (institution.vkOwnerId !== ownerId) {
      await payload.update({
        collection: 'institutions',
        id: institution.id,
        context: { disableRevalidate: true },
        data: { vkOwnerId: ownerId },
      })
    }

    let items: VkWallItem[]
    try {
      const wall = await wallGet(ownerId, wallCount, token)
      items = wall.items ?? []
      await sleep(VK_RATE_LIMIT_MS)
    } catch (err) {
      // Закрытая стена и удалённое сообщество — обычное дело для сельских групп.
      // Одно такое учреждение не должно останавливать импорт остальных.
      say(`${label}: стена недоступна — ${describeVkError(err)}`)
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

    summary.institutions += 1
    summary.created += stats.created
    summary.skipped += stats.skipped
    summary.failed += stats.failed

    say(
      `${label}: со стены ${items.length}, создано ${stats.created}, ` +
        `уже было ${stats.skipped}, с ошибкой ${stats.failed}`,
    )
  }

  return summary
}

// Сообщение собирается из полей ошибки, а не из строки запроса: в URL к
// api.vk.com лежит токен, и наивный дамп утащил бы его в журнал прода.
export function describeVkError(err: unknown): string {
  if (err instanceof VkError) return `VK ${err.code}: ${err.message}`
  if (err instanceof Error) return err.message
  return 'неизвестная ошибка'
}
