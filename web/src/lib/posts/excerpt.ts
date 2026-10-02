// Разбор текста записи на плоский текст и сборка описания для метаданных.
//
// Вынесено из `dedupe.ts` и `posters.ts` (там лежали две одинаковые копии
// обхода lexical) и переиспользовано метаданными новости: описание страницы
// строится из того же текста, по которому судят служебные операции.

import { SITE_DESC } from '../site'

// В сырых документах Payload поля `content` нет вовсе — текст лежит в lexical,
// и достать его можно только обходом дерева.
export function lexicalText(data: unknown): string {
  const out: string[] = []
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    const row = node as Record<string, unknown>
    if (row['type'] === 'text' && typeof row['text'] === 'string') out.push(row['text'])
    const children = row['children']
    if (Array.isArray(children)) children.forEach(walk)
    if (row['root']) walk(row['root'])
  }
  walk(data)
  return out.join('\n')
}

// Описание для поисковика: одна строка, обрезка по границе слова.
//
// Многоточие ставится только когда текст реально обрезан — иначе описание
// выглядит оборванным там, где всё поместилось.
export function makeExcerpt(text: string, maxLength = 160): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  if (clean.length <= maxLength) return clean
  const cut = clean.slice(0, maxLength)
  const space = cut.lastIndexOf(' ')
  const head = space > maxLength * 0.5 ? cut.slice(0, space) : cut
  return `${head.trim()}…`
}

// Описание страницы новости. Текст записи — первичен: сниппет по материалу
// полезнее пересказа названия. У записи без текста (афиша-картинка, фотоальбом)
// остаётся имя дома культуры — это отличие от общей подписи сайта, ради
// которого всё и затевалось: раньше все 835 новостей отдавали ОДИН description
// из layout, и поисковик показывал одинаковый сниппет на каждой.
export function postDescription(input: {
  text?: string | null
  title?: string | null
  institutionTitle?: string | null
}): string {
  const excerpt = makeExcerpt(input.text ?? '')
  if (excerpt) return excerpt
  const title = (input.title ?? '').trim()
  const institution = (input.institutionTitle ?? '').trim()
  if (title && institution) return `${title} — ${institution}.`
  if (title) return title
  return SITE_DESC
}
