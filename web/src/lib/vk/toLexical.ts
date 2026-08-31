// Текст записи ВК → lexical-документ, который умеет отрисовать наш RichText.
//
// Сознательно поддерживаем ровно то, что рендерер и правда рисует: абзацы,
// переносы строк и ссылки. Узлы, которые RichText пропускает (upload, block),
// здесь не создаются вовсе — иначе картинка «импортировалась» бы и не
// показывалась. Фото записи едут отдельными полями cover/gallery.

type LexText = { type: 'text'; text: string; format: number; detail: number; mode: 'normal'; style: string; version: 1 }
type LexLineBreak = { type: 'linebreak'; version: 1 }
type LexLink = {
  type: 'link'
  version: 1
  fields: { url: string; newTab: boolean; linkType: 'custom' }
  children: LexText[]
}
type LexInline = LexText | LexLineBreak | LexLink
type LexParagraph = {
  type: 'paragraph'
  version: 1
  format: ''
  indent: 0
  direction: 'ltr'
  children: LexInline[]
}

export type LexicalDoc = {
  root: {
    type: 'root'
    version: 1
    format: ''
    indent: 0
    direction: 'ltr'
    children: LexParagraph[]
  }
}

const text = (value: string): LexText => ({
  type: 'text',
  text: value,
  format: 0,
  detail: 0,
  mode: 'normal',
  style: '',
  version: 1,
})

const link = (url: string, label: string): LexLink => ({
  type: 'link',
  version: 1,
  fields: { url, newTab: true, linkType: 'custom' },
  children: [text(label)],
})

const paragraph = (children: LexInline[]): LexParagraph => ({
  type: 'paragraph',
  version: 1,
  format: '',
  indent: 0,
  direction: 'ltr',
  children,
})

// Голые ссылки в тексте ВК не размечены никак. Хвостовая пунктуация в URL не
// входит: «сайт https://example.org.» — точка тут конец предложения, а не адреса.
const URL_RE = /https?:\/\/[^\s<>]+/g
const TRAILING = /[.,;:!?)»"'\]]+$/

function inlineFrom(line: string): LexInline[] {
  const out: LexInline[] = []
  let last = 0
  for (const match of line.matchAll(URL_RE)) {
    const start = match.index ?? 0
    let url = match[0]
    const trailing = TRAILING.exec(url)
    if (trailing) url = url.slice(0, url.length - trailing[0].length)
    if (!url) continue
    if (start > last) out.push(text(line.slice(last, start)))
    out.push(link(url, url))
    last = start + url.length
  }
  if (last < line.length) out.push(text(line.slice(last)))
  return out.length > 0 ? out : [text(line)]
}

/**
 * Пустой текст даёт документ с одним пустым абзацем, а не null: у записи из ВК
 * бывает только фото, и поле content должно оставаться валидным lexical —
 * иначе редактор в админке открывается со сломанным состоянием.
 */
export function vkTextToLexical(raw: string | null | undefined): LexicalDoc {
  const value = (raw ?? '').replace(/\r\n/g, '\n').trim()

  // Пустая строка между абзацами — разделитель абзацев; одиночный перенос
  // остаётся переносом внутри абзаца. В постах СДК так набирают афиши.
  const blocks = value ? value.split(/\n{2,}/) : ['']

  const children = blocks.map((block) => {
    const lines = block.split('\n')
    const inline: LexInline[] = []
    lines.forEach((line, i) => {
      if (i > 0) inline.push({ type: 'linebreak', version: 1 })
      inline.push(...inlineFrom(line))
    })
    return paragraph(inline)
  })

  return {
    root: { type: 'root', version: 1, format: '', indent: 0, direction: 'ltr', children },
  }
}

/**
 * Заголовок новости. У записи ВК заголовка нет вовсе — берём первую осмысленную
 * строку, обрезая по границе слова. Пустой текст (запись из одних фото) даёт
 * запасной заголовок: документ без title в админке выглядит потерянным.
 */
export function vkTitleFrom(raw: string | null | undefined, fallback: string): string {
  const firstLine = (raw ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0)

  if (!firstLine) return fallback

  const clean = firstLine.replace(/\s+/g, ' ').trim()
  if (clean.length <= 90) return clean

  const cut = clean.slice(0, 90)
  const space = cut.lastIndexOf(' ')
  return `${(space > 40 ? cut.slice(0, space) : cut).trim()}…`
}
