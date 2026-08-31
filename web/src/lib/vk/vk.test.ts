import { describe, expect, it } from 'vitest'

import { parseVkTarget } from './screenName'
import { itemText, isImportable, largestSize, photoUrls } from './photos'
import { vkTextToLexical, vkTitleFrom } from './toLexical'
import { readGatewayConfig } from './api'

// Идентификаторы в фикстурах — выдуманные, не из документации ВК и не боевые:
// пример из доков вендора лежит в allowlist сканера секретов и оставляет гейт
// зелёным ровно там, где он должен краснеть (G258).

describe('parseVkTarget', () => {
  it('сообщество по числовому адресу даёт ОТРИЦАТЕЛЬНЫЙ owner_id', () => {
    expect(parseVkTarget('https://vk.com/club157904213')).toEqual({
      kind: 'owner',
      ownerId: -157904213,
    })
    expect(parseVkTarget('https://vk.com/public179595292')).toEqual({
      kind: 'owner',
      ownerId: -179595292,
    })
  })

  // Часть сельских ДК ведёт личную страницу, а не сообщество: знак owner_id —
  // единственное, что отличает их стену от чужой.
  it('личная страница даёт положительный owner_id', () => {
    expect(parseVkTarget('https://vk.com/id444820854')).toEqual({
      kind: 'owner',
      ownerId: 444820854,
    })
  })

  it('короткое имя отдаётся на resolveScreenName', () => {
    expect(parseVkTarget('https://vk.com/dk_malmyzh')).toEqual({
      kind: 'screenName',
      screenName: 'dk_malmyzh',
    })
  })

  it('терпит хвосты, m-домен, vk.ru, отсутствие схемы и лишние пробелы', () => {
    const expected = { kind: 'screenName', screenName: 'dk_malmyzh' }
    expect(parseVkTarget('https://vk.com/dk_malmyzh?w=wall-1_2')).toEqual(expected)
    expect(parseVkTarget('https://m.vk.com/dk_malmyzh/')).toEqual(expected)
    expect(parseVkTarget('https://vk.ru/dk_malmyzh')).toEqual(expected)
    expect(parseVkTarget('vk.com/dk_malmyzh')).toEqual(expected)
    expect(parseVkTarget('  dk_malmyzh  ')).toEqual(expected)
  })

  it('чужой хост и мусор дают null — импорт такое учреждение пропустит', () => {
    expect(parseVkTarget('https://ok.ru/dk_malmyzh')).toBeNull()
    expect(parseVkTarget('https://example.org/vk.com/dk')).toBeNull()
    expect(parseVkTarget('не ссылка')).toBeNull()
    expect(parseVkTarget('')).toBeNull()
    expect(parseVkTarget(null)).toBeNull()
  })

  // vk.com/dk-malmyzh не бывает: дефис в коротких именах ВК не допускается,
  // и такой адрес — почти наверняка опечатка редактора.
  it('недопустимые символы в имени дают null', () => {
    expect(parseVkTarget('https://vk.com/dk-malmyzh')).toBeNull()
  })
})

describe('vkTextToLexical', () => {
  it('пустой текст даёт валидный документ с одним абзацем', () => {
    const doc = vkTextToLexical('')
    expect(doc.root.children).toHaveLength(1)
    expect(doc.root.children[0].type).toBe('paragraph')
  })

  it('пустая строка разделяет абзацы, одиночный перенос остаётся переносом', () => {
    const doc = vkTextToLexical('Первый\nвторая строка\n\nВторой абзац')
    expect(doc.root.children).toHaveLength(2)
    expect(doc.root.children[0].children.map((n) => n.type)).toEqual([
      'text',
      'linebreak',
      'text',
    ])
  })

  it('голая ссылка становится кликабельной', () => {
    const doc = vkTextToLexical('Подробности https://example.org/afisha ждём всех')
    const kinds = doc.root.children[0].children.map((n) => n.type)
    expect(kinds).toEqual(['text', 'link', 'text'])
  })

  // «...на example.org/x.» — точка тут конец предложения; попав в href, она даёт
  // битую ссылку, и заметно это только глазами на живой странице.
  it('хвостовая пунктуация не попадает в адрес', () => {
    const doc = vkTextToLexical('Смотрите https://example.org/afisha.')
    const linkNode = doc.root.children[0].children.find((n) => n.type === 'link')
    expect(linkNode).toBeDefined()
    expect((linkNode as { fields: { url: string } }).fields.url).toBe('https://example.org/afisha')
  })

  it('создаёт только те узлы, которые рендерер умеет рисовать', () => {
    const doc = vkTextToLexical('Текст\nи ссылка https://example.org')
    const types = new Set(doc.root.children.flatMap((p) => p.children.map((n) => n.type)))
    expect([...types].every((t) => ['text', 'linebreak', 'link'].includes(t))).toBe(true)
  })
})

describe('vkTitleFrom', () => {
  it('берёт первую непустую строку', () => {
    expect(vkTitleFrom('\n\n  Концерт ко Дню села  \nподробности ниже', 'Запись')).toBe(
      'Концерт ко Дню села',
    )
  })

  it('запись из одних фото получает запасной заголовок', () => {
    expect(vkTitleFrom('', 'Фотоотчёт')).toBe('Фотоотчёт')
    expect(vkTitleFrom(null, 'Фотоотчёт')).toBe('Фотоотчёт')
  })

  it('длинную строку режет по границе слова', () => {
    const long = 'Приглашаем всех жителей и гостей села на большой праздничный концерт художественной самодеятельности'
    const title = vkTitleFrom(long, 'Запись')
    expect(title.length).toBeLessThanOrEqual(91)
    expect(title.endsWith('…')).toBe(true)
    expect(title).not.toMatch(/\s…$/)
  })
})

describe('выбор фото', () => {
  it('берёт самый крупный размер, а не первый в массиве', () => {
    const best = largestSize([
      { url: 'small', width: 130, height: 100 },
      { url: 'big', width: 1280, height: 960 },
      { url: 'mid', width: 604, height: 453 },
    ])
    expect(best?.url).toBe('big')
  })

  it('без размеров — null, а не падение', () => {
    expect(largestSize(undefined)).toBeNull()
    expect(largestSize([])).toBeNull()
  })

  // Сельские ДК часто репостят афишу района: без разбора copy_history запись
  // приезжала бы без текста и без картинок.
  it('репост отдаёт текст и фото оригинала', () => {
    const item = {
      id: 11,
      text: '',
      copy_history: [
        {
          id: 7,
          text: 'Афиша на выходные',
          attachments: [{ type: 'photo', photo: { sizes: [{ url: 'orig', width: 800, height: 600 }] } }],
        },
      ],
    }
    expect(itemText(item)).toBe('Афиша на выходные')
    expect(photoUrls(item)).toEqual(['orig'])
  })

  it('свой текст репоста важнее текста оригинала', () => {
    expect(itemText({ id: 1, text: 'Наш комментарий', copy_history: [{ text: 'оригинал' }] })).toBe(
      'Наш комментарий',
    )
  })

  it('соблюдает предел числа фото', () => {
    const item = {
      id: 2,
      attachments: Array.from({ length: 12 }, (_, i) => ({
        type: 'photo',
        photo: { sizes: [{ url: `p${i}`, width: 100, height: 100 }] },
      })),
    }
    expect(photoUrls(item, 3)).toEqual(['p0', 'p1', 'p2'])
  })
})

describe('isImportable', () => {
  it('пропускает обычную запись', () => {
    expect(isImportable({ id: 5 })).toBe(true)
  })

  // Закреплённая запись висит годами: без этого фильтра она лезла бы наверх
  // ленты при каждой синхронизации как свежая.
  it('отбрасывает рекламу и закреп', () => {
    expect(isImportable({ id: 5, marked_as_ads: 1 })).toBe(false)
    expect(isImportable({ id: 5, is_pinned: 1 })).toBe(false)
  })

  it('без id импортировать нечего', () => {
    expect(isImportable({})).toBe(false)
  })
})

describe('readGatewayConfig', () => {
  // Ходим в ВК только через шлюз SARAFAN; половина настройки — не настройка,
  // и «есть ключ, но нет адреса» должно означать «выключено», а не попытку.
  it('без адреса или без ключа — null', () => {
    expect(readGatewayConfig({})).toBeNull()
    expect(readGatewayConfig({ SARAFAN_GATEWAY_URL: 'https://gw.invalid' })).toBeNull()
    expect(readGatewayConfig({ SARAFAN_GATEWAY_KEY: 'k' })).toBeNull()
    expect(
      readGatewayConfig({ SARAFAN_GATEWAY_URL: '  ', SARAFAN_GATEWAY_KEY: '  ' }),
    ).toBeNull()
  })

  it('обрезает пробелы и хвостовой слэш — иначе выйдет //api/gateway/call', () => {
    expect(
      readGatewayConfig({ SARAFAN_GATEWAY_URL: ' https://gw.invalid/ ', SARAFAN_GATEWAY_KEY: ' k ' }),
    ).toEqual({ url: 'https://gw.invalid', key: 'k' })
  })
})
