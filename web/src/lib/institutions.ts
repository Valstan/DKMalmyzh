// Общие типы и хелперы по домам культуры. Лежат отдельно от views, потому что
// нужны сразу трём местам: общей ленте, странице учреждения и главной.

import { domainToUnicode } from 'node:url'

export type InstitutionRef = {
  id: string | number
  title?: string | null
  shortTitle?: string | null
  slug?: string | null
  website?: string | null
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

// Куда вести ссылку на учреждение: у кого есть личный домен — на него, у
// остальных — на раздел портала. Внутренние ссылки остаются относительными
// (их перехватывает роутер без перезагрузки), внешние — абсолютными.
export function institutionUrl(ref: InstitutionRef): string {
  const website = (ref.website || '').trim()
  if (/^https?:\/\//i.test(website)) return website
  return institutionHref(ref)
}

// Человекочитаемое имя личного домена для подписи под ссылкой: punycode в
// базе, кириллица на экране. Нет домена — пустая строка, подписи нет.
export function institutionDomainName(ref: InstitutionRef): string {
  const website = (ref.website || '').trim()
  if (!/^https?:\/\//i.test(website)) return ''
  try {
    return domainToUnicode(new URL(website).hostname)
  } catch {
    return ''
  }
}
