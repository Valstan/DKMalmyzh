import type { Payload } from 'payload'

import { normalizeNav, REQUIRED_NAV, sameHref, type NavItem } from './nav'
import { SITE_NAME } from '../site'

// Пункты меню в шапке: глобал `header`. На проде он создан, но список пунктов
// может быть неполным — тогда недостающее дописывает эта операция, а страница
// показывает обязательные пункты и без неё (`nav.ts`).
//
// Операция НЕ переписывает шапку, а ДОБАВЛЯЕТ недостающее: подписи и порядок,
// которые владелец поправил руками, остаются как есть. Иначе служебный прогон
// молча затирал бы редактора — худший вид служебной операции.
//
// Идемпотентна: повторный прогон ничего не меняет и честно пишет «добавлено 0».

export type { NavItem }
export { REQUIRED_NAV }

export type NavMerge = { nav: NavItem[]; added: NavItem[] }

export function ensureNavItems(existing: unknown, required: NavItem[] = REQUIRED_NAV): NavMerge {
  const current = normalizeNav(existing)
  const added = required.filter((item) => !current.some((row) => sameHref(row.href, item.href)))
  return { nav: [...current, ...added], added }
}

export type SeedNavSummary = {
  ok: boolean
  dry: boolean
  added: NavItem[]
  navTotal: number
  brandSet: boolean
  messages: string[]
}

export async function seedHeaderNav(
  payload: Payload,
  options: { dry?: boolean; log?: (message: string) => void } = {},
): Promise<SeedNavSummary> {
  const dry = options.dry === true
  const say = (message: string) => options.log?.(message)
  const summary: SeedNavSummary = {
    ok: true,
    dry,
    added: [],
    navTotal: 0,
    brandSet: false,
    messages: [],
  }

  const header = (await payload.findGlobal({ slug: 'header', depth: 0 })) as unknown as Record<string, unknown> | null
  const { nav, added } = ensureNavItems(header?.['nav'])
  summary.added = added
  summary.navTotal = nav.length

  const brand = typeof header?.['brand'] === 'string' ? (header['brand'] as string).trim() : ''
  // Название из кода — только если подписи в глобале нет вовсе: заполнять
  // пустое поле разумно, а переписывать написанное владельцем — нет.
  const data: Record<string, unknown> = {}
  if (added.length > 0) data['nav'] = nav
  if (!brand) data['brand'] = SITE_NAME
  summary.brandSet = !brand

  if (Object.keys(data).length === 0) {
    say('шапка уже в порядке — ничего не меняю')
    return summary
  }

  const describe = `добавляю в меню: ${added.map((i) => `${i.label} (${i.href})`).join(', ') || '—'}${
    summary.brandSet ? `; название сайта: ${SITE_NAME}` : ''
  }`
  summary.messages.push(describe)

  if (dry) {
    say(`сухой прогон: ${describe}`)
    return summary
  }

  await payload.updateGlobal({
    slug: 'header',
    data,
    context: { disableRevalidate: true },
  })

  const check = (await payload.findGlobal({ slug: 'header', depth: 0 })) as unknown as Record<string, unknown> | null
  const after = ensureNavItems(check?.['nav']).nav.length
  if (added.length > 0 && after < nav.length) {
    summary.ok = false
    summary.messages.push(`после записи в меню ${after} пунктов вместо ${nav.length}`)
  }
  say(`${describe}; в меню теперь ${after} пунктов`)
  return summary
}
