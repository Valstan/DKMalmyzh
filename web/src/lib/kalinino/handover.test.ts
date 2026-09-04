import { describe, expect, it } from 'vitest'

import {
  categoryLabelFor,
  contentFor,
  findSlugCollisions,
  isLexicalDoc,
  isSafeHandoverDir,
  mediaFilenamesOf,
  normalizeVideos,
  parseHandover,
  postTypeFor,
  resolveHandoverDuplicates,
} from './handover'

// Чистый разбор выгрузки Калинино. Форма данных — как у export.sql их репозитория.

describe('разбор posts.json', () => {
  it('откладывает записи без vkPostId, а не теряет их молча', () => {
    const parsed = parseHandover(
      [
        { id: 1, title: 'А', slug: 'a', vkPostId: '-1_1' },
        { id: 2, title: 'Б', slug: 'b', vkPostId: null },
        { id: 3, title: 'В', slug: '', vkPostId: '-1_3' },
      ],
      [],
    )
    expect(parsed.posts.map((p) => p.vkPostId)).toEqual(['-1_1'])
    expect(parsed.withoutKey).toHaveLength(2)
  })

  it('принимает и массив, и объект с items', () => {
    const arr = parseHandover([{ id: 1, title: 'А', slug: 'a', vkPostId: '-1_1' }], [])
    const obj = parseHandover({ items: [{ id: 1, title: 'А', slug: 'a', vkPostId: '-1_1' }] }, [])
    expect(arr.posts).toHaveLength(1)
    expect(obj.posts).toHaveLength(1)
  })

  it('рубрики индексируются по slug', () => {
    const parsed = parseHandover([], [{ id: 1, title: 'Афиша', slug: 'afisha' }])
    expect(categoryLabelFor('afisha', parsed.categories)).toBe('Афиша')
    expect(categoryLabelFor('nope', parsed.categories)).toBe('nope')
    expect(categoryLabelFor(null, parsed.categories)).toBeUndefined()
  })
})

describe('соответствие полей', () => {
  it('их «Афиша» — наш вид event, остальное — новость', () => {
    expect(postTypeFor('afisha')).toBe('event')
    expect(postTypeFor('koncerty')).toBe('news')
    expect(postTypeFor(undefined)).toBe('news')
  })

  it('видео сортируются по _order и фильтруются по адресу', () => {
    const videos = normalizeVideos([
      { url: 'https://vkvideo.ru/video_ext.php?oid=1&id=2', title: '', _order: 2 },
      { url: 'not a url', _order: 1 },
      { url: 'https://example.org/a.mp4', title: 'Ролик', _order: 1 },
    ])
    expect(videos).toEqual([
      { url: 'https://example.org/a.mp4', title: 'Ролик' },
      { url: 'https://vkvideo.ru/video_ext.php?oid=1&id=2', title: undefined },
    ])
  })

  it('имена файлов: обложка первой, галерея по порядку, без повторов', () => {
    const names = mediaFilenamesOf({
      id: 1,
      title: 'А',
      slug: 'a',
      coverFilename: 'vk-1-0.jpg',
      gallery: [
        { order: 2, filename: 'vk-1-2.jpg' },
        { order: 1, filename: 'vk-1-1.jpg' },
        { order: 3, filename: 'vk-1-0.jpg' },
      ],
    })
    expect(names).toEqual(['vk-1-0.jpg', 'vk-1-1.jpg', 'vk-1-2.jpg'])
  })

  it('пустое содержимое — пустой абзац, битое — отказ', () => {
    expect(contentFor(null)?.root.children).toHaveLength(1)
    expect(contentFor(undefined)).not.toBeNull()
    expect(contentFor('текст')).toBeNull()
    const doc = { root: { type: 'root', children: [] } }
    expect(contentFor(doc)).toBe(doc)
  })

  it('lexical-документ узнаётся по форме', () => {
    expect(isLexicalDoc({ root: { type: 'root', children: [] } })).toBe(true)
    expect(isLexicalDoc({ root: {} })).toBe(false)
    expect(isLexicalDoc('текст')).toBe(false)
    expect(isLexicalDoc(null)).toBe(false)
  })
})

describe('каталог выгрузки в query', () => {
  it('принимает абсолютный путь из безопасных символов', () => {
    expect(isSafeHandoverDir('/srv/kalinino/handover-2026-09-04')).toBe(true)
  })

  it('отвергает относительные пути, .. и пробелы', () => {
    expect(isSafeHandoverDir('kalinino')).toBe(false)
    expect(isSafeHandoverDir('/a/../etc')).toBe(false)
    expect(isSafeHandoverDir('/a b')).toBe(false)
    expect(isSafeHandoverDir('/a;rm')).toBe(false)
  })
})

describe('коллизии адресов', () => {
  const posts = [
    { id: 1, title: 'А', slug: 'koncert', vkPostId: '-1_1' },
    { id: 2, title: 'Б', slug: 'koncert', vkPostId: '-1_2' },
    { id: 3, title: 'В', slug: 'prazdnik', vkPostId: '-1_3' },
    { id: 4, title: 'Г', slug: 'svoy', vkPostId: '-1_4' },
  ]

  it('дубль внутри выгрузки — коллизия', () => {
    const found = findSlugCollisions(posts, new Map())
    expect(found.map((c) => c.slug)).toEqual(['koncert'])
    expect(found[0].incoming).toEqual(['-1_1', '-1_2'])
  })

  it('адрес занят чужой записью портала — коллизия с именем владельца', () => {
    const taken = new Map([
      ['prazdnik', { vkUid: '-99_5', id: 10 }],
      ['svoy', { vkUid: null, id: 11 }],
    ])
    const found = findSlugCollisions(posts.slice(2), taken)
    expect(found).toEqual([
      { slug: 'prazdnik', incoming: ['-1_3'], takenBy: '-99_5' },
      { slug: 'svoy', incoming: ['-1_4'], takenBy: 'ручная запись #11' },
    ])
  })

  it('та же запись по vkUid — не коллизия, она обновится', () => {
    const taken = new Map([['prazdnik', { vkUid: '-1_3', id: 10 }]])
    expect(findSlugCollisions(posts.slice(2, 3), taken)).toEqual([])
  })
})

describe('повторы адресов внутри выгрузки', () => {
  it('новейшая запись оставляет адрес, старшие получают хвост из vkPostId', () => {
    const posts = [
      { id: 40, title: 'А', slug: 'uvazhaemye-druzya', vkPostId: '-218_1040' },
      { id: 57, title: 'Б', slug: 'uvazhaemye-druzya', vkPostId: '-218_1057' },
      { id: 3, title: 'В', slug: 'drugoy', vkPostId: '-218_3' },
    ]
    const renames = resolveHandoverDuplicates(posts)
    expect(renames).toEqual([{ vkPostId: '-218_1040', from: 'uvazhaemye-druzya', to: 'uvazhaemye-druzya-218-1040' }])
    expect(posts[1].slug).toBe('uvazhaemye-druzya')
    expect(posts[0].slug).toBe('uvazhaemye-druzya-218-1040')
    expect(findSlugCollisions(posts, new Map())).toEqual([])
  })

  it('без повторов ничего не переименовывает', () => {
    const posts = [{ id: 1, title: 'А', slug: 'a', vkPostId: '-1_1' }]
    expect(resolveHandoverDuplicates(posts)).toEqual([])
    expect(posts[0].slug).toBe('a')
  })
})
