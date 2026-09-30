import { INSTITUTIONS, type InstitutionSeed } from './catalog'

// Разделы без своего сообщества: своего потока новостей у них нет физически —
// события идут через другой дом культуры. Чтобы такой раздел не выглядел
// пустым, его лента собирается по упоминанию населённого пункта (решение
// владельца 30.09), а настоящий бейджем дома культуры у каждой записи.
//
// Признак живёт здесь, в справочнике, а не в базе: это свойство места, а не
// редакционное поле материала, и менять его из админки незачем. Если решение
// поменяется — правятся три строки справочника.

export const MENTION_FEED_NOTE = 'Своего сообщества нет — здесь показываем новости, где упоминается наше село.'

export function catalogEntry(slug: string): InstitutionSeed | undefined {
  return INSTITUTIONS.find((item) => item.slug === slug)
}

// Лента раздела — по упоминанию населённого пункта, а не по учреждению.
export function isMentionFeed(slug: string): boolean {
  return catalogEntry(slug)?.feedByMentions === true
}

// Основы для поиска по упоминанию — из названия населённого пункта.
//
// Русские падежи не дают искать подстрокой по полному названию («в Нослах» не
// содержит «Нослы»), поэтому от каждого слова берётся основа. Правило отрезает
// окончание, а прилагательные на -ый/-ий — на два знака: у них родительный
// падеж меняет основу («малый» → «Малого Китяка», а «малы» туда не подошёл бы).
// Дальше по основам строится `LIKE`, а сверху результат проверяется по словам —
// «Малый Китяк» и «Большой Китяк» разойдутся по двум основам сразу.
function stemOf(word: string): string {
  if (/(ый|ий|ая|яя)$/u.test(word)) return word.slice(0, -2)
  if (word.length >= 7) return word.slice(0, -2)
  if (word.length >= 4) return word.slice(0, -1)
  return word
}

export function stemsFromSettlement(settlement: string | null | undefined): string[] {
  const words = String(settlement ?? '')
    .toLowerCase()
    .replace(/^(г|с|д|п|пос)\.\s*/i, '')
    .match(/[а-яёa-z0-9]+/g)
  if (!words) return []
  return words.filter((word) => word.length >= 3).map(stemOf)
}

export function mentionStems(slug: string): string[] {
  return stemsFromSettlement(catalogEntry(slug)?.settlement)
}
