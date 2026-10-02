// Пункты меню, без которых сайт неполон, — в одном месте, потому что на них
// смотрят две разные стороны.
//
// Сторона записи — `seedNav`: служебная операция дописывает недостающее в глобал
// шапки, не трогая написанное руками (владелец может переставить и переименовать).
//
// Сторона показа — `SiteChrome`: пункты дописываются прямо при отрисовке, если
// их нет в базе. Раньше кодовый запасной список срабатывал только на пустой шапке
// целиком, а на проде шапка непустая — то есть «страница есть, а в меню её нет»
// могло длиться неограниченно, пока кто-то не вспомнит про служебную операцию.
//
// Именно так и вышло со «Вопросами и ответами»: страница выкачена, в меню её нет,
// и найти её можно только угадав адрес. В меню попадают оба слоя, дубли не
// заводятся — сравнение адресов то же, что и при записи (хвостовой слэш и
// регистр не считаются различием).
//
// Смысл «обязательного» пункта тот же, что и у seedNav: если владелец уберёт его
// руками, код вернёт. Это осознанный размен — доступность важнее воли одного
// редактора; переименовать и переставить пункт можно, убрать — нет.

export type NavItem = { label: string; href: string }

export const REQUIRED_NAV: NavItem[] = [
  { label: 'Новости', href: '/news' },
  { label: 'Дома культуры', href: '/dk' },
  { label: 'Праздники района', href: '/prazdniki' },
  { label: 'Вопросы и ответы', href: '/faq' },
]

// Адреса сравниваются без хвостового слэша и в нижнем регистре: `/dk` и `/dk/`
// — один и тот же пункт, иначе прогон дописал бы дубль.
export function sameHref(a: unknown, b: string): boolean {
  return (
    typeof a === 'string' &&
    a.trim().replace(/\/+$/, '').toLowerCase() === b.replace(/\/+$/, '').toLowerCase()
  )
}

export function normalizeNav(existing: unknown): NavItem[] {
  if (!Array.isArray(existing)) return []
  const seen = new Set<string>()
  const out: NavItem[] = []
  for (const item of existing) {
    const row = (item ?? {}) as Record<string, unknown>
    const label = typeof row['label'] === 'string' ? row['label'].trim() : ''
    const href = typeof row['href'] === 'string' ? row['href'].trim() : ''
    if (!label || !href) continue
    // Дубль по адресу ВНУТРИ самого списка отбрасываем, оставляя первый.
    // Проверка «уже есть среди обязательных» такого не ловила: меню целиком
    // рисуется на каждой странице, и две одинаковые кнопки видны посетителю.
    const key = href.replace(/\/+$/, '').toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ label, href })
  }
  return out
}

/**
 * Пункты для показа: сначала написанное владельцем в его порядке, затем
 * недостающие обязательные. Возвращает новый массив — вход не мутируется.
 */
export function mergeNav(existing: unknown, required: NavItem[] = REQUIRED_NAV): NavItem[] {
  const current = normalizeNav(existing)
  const missing = required.filter((item) => !current.some((row) => sameHref(row.href, item.href)))
  return [...current, ...missing]
}