import { domainToUnicode } from 'node:url'

import type { InstitutionRef } from './institutions'

// Человекочитаемое имя личного домена для подписи под ссылкой: punycode в
// базе, кириллица на экране. Нет домена — пустая строка, подписи нет.
//
// Отдельный модуль, а не рядом с остальными хелперами домов культуры: он тянет
// `node:url`, а те используются клиентским компонентом ленты, и node-модуль в
// браузерном бандле Next не собирается.

export function institutionDomainName(ref: InstitutionRef): string {
  const website = (ref.website || '').trim()
  if (!/^https?:\/\//i.test(website)) return ''
  try {
    return domainToUnicode(new URL(website).hostname)
  } catch {
    return ''
  }
}
