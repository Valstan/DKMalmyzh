// Общие типы и хелперы по домам культуры. Лежат отдельно от views, потому что
// нужны сразу трём местам: общей ленте, странице учреждения и главной.

export type InstitutionRef = {
  id: string | number
  title?: string | null
  shortTitle?: string | null
  slug?: string | null
}

// Бейдж в общей ленте: короткое название, если задано, иначе полное. Материал без
// учреждения — общерайонный, бейджа не получает (а не «Без названия»).
export function institutionBadge(institution: unknown): InstitutionRef | null {
  if (!institution || typeof institution !== 'object') return null
  const ref = institution as InstitutionRef
  if (!ref.slug) return null
  return ref
}

export function institutionLabel(ref: InstitutionRef): string {
  return ref.shortTitle || ref.title || 'Дом культуры'
}

export function institutionHref(ref: InstitutionRef): string {
  return `/dk/${encodeURIComponent(ref.slug ?? '')}`
}
