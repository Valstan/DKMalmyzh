// Разбор ссылки на сообщество/страницу ВК. Редактор вставляет адрес как есть —
// из адресной строки, из репоста, иногда с UTM-хвостом, — а импорту нужен
// screen_name, который потом резолвится в owner_id.
//
// Отдельным модулем (а не внутри клиента API), потому что это единственная
// чистая функция во всём импорте: её можно накрыть тестами без сети и токена.

export type VkTarget =
  // vk.com/club123, vk.com/public123, vk.com/id123 — числовой id прямо в адресе
  | { kind: 'owner'; ownerId: number }
  // vk.com/dk_malmyzh — короткое имя, owner_id узнаётся через utils.resolveScreenName
  | { kind: 'screenName'; screenName: string }

const NUMERIC = /^(club|public|group)(\d+)$/
const PROFILE = /^id(\d+)$/

/**
 * Возвращает null, если ссылка не похожа на адрес ВК: пустое поле, чужой сайт,
 * мусор. Импорт такое учреждение просто пропускает — молча ломиться в API с
 * непонятным именем хуже, чем не пойти вовсе.
 */
export function parseVkTarget(input: string | null | undefined): VkTarget | null {
  if (!input) return null
  const raw = input.trim()
  if (!raw) return null

  let path: string
  if (/^https?:\/\//i.test(raw)) {
    let url: URL
    try {
      url = new URL(raw)
    } catch {
      return null
    }
    // m.vk.com, vk.ru — те же стены; чужие хосты отбрасываем.
    if (!/(^|\.)(vk\.com|vk\.ru)$/i.test(url.hostname)) return null
    path = url.pathname
  } else {
    // Часто вставляют без схемы: «vk.com/dk_malmyzh» или просто «dk_malmyzh».
    path = raw.replace(/^(?:https?:\/\/)?(?:m\.)?vk\.(?:com|ru)/i, '')
  }

  const name = path.replace(/^\/+/, '').split(/[/?#]/)[0]?.trim()
  if (!name) return null
  // Короткие имена ВК: латиница, цифры, точки и подчёркивания.
  if (!/^[A-Za-z0-9._]+$/.test(name)) return null

  const numeric = NUMERIC.exec(name)
  // Сообщество: owner_id отрицательный. Знак ставится здесь и больше нигде —
  // потерять его значит запросить стену случайного пользователя с тем же числом.
  if (numeric) return { kind: 'owner', ownerId: -Number(numeric[2]) }

  const profile = PROFILE.exec(name)
  if (profile) return { kind: 'owner', ownerId: Number(profile[1]) }

  return { kind: 'screenName', screenName: name }
}
