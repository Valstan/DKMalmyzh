import config from '@payload-config'
import { mkdtemp, mkdir, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { getPayload } from 'payload'

import type { HandoverPost } from '../src/lib/kalinino/handover'
import { transferKalinino } from '../src/lib/kalinino/transfer'

// Гейт переноса Калинино (D-074): прогон ядра на выгрузке той же формы, что
// делает export.sql их репозитория, но на живой БД после накатанной миграции.
//
// Что проверяется:
//  - сухой прогон ничего не пишет и печатает план;
//  - боевой прогон создаёт записи с полями videos/sourceUrl, обложкой и галереей,
//    сохраняет slug из выгрузки и статус публикации;
//  - повторный прогон ничего не создаёт и не плодит медиа (идемпотентность по
//    vkUid и по имени файла);
//  - запись, уже привезённая нашим импортом под тем же vkUid, обновляется, а
//    её медиа не заливаются второй раз;
//  - коллизия адреса с чужой записью — условие выхода: боевой прогон не начат.

const ctx = { disableRevalidate: true }

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

// Подставной owner_id — выдуманный (G258).
const OWNER = -900000021

const lexical = (text: string) => ({
  root: {
    type: 'root',
    version: 1,
    format: '' as const,
    indent: 0,
    direction: null,
    children: [
      {
        type: 'paragraph',
        version: 1,
        format: '' as const,
        indent: 0,
        direction: null,
        children: [{ type: 'text', text, format: 0, detail: 0, mode: 'normal', style: '', version: 1 }],
      },
    ],
  },
})

const POSTS: HandoverPost[] = [
  {
    id: 1,
    title: 'Концерт ко Дню села',
    slug: 'koncert-ko-dnyu-sela',
    date: '2026-08-20T15:00:00.000Z',
    publishedAt: '2026-08-20T15:10:00.000Z',
    status: 'published',
    vkPostId: `${OWNER}_1`,
    sourceUrl: `https://vk.com/wall${OWNER}_1`,
    categoryId: 3,
    categorySlug: 'koncerty',
    coverId: 11,
    coverFilename: 'vk-ci-1-0.png',
    gallery: [
      { order: 1, mediaId: 12, filename: 'vk-ci-1-1.png', path: 'gallery' },
      { order: 0, mediaId: 13, filename: 'vk-ci-1-2.png', path: 'gallery' },
    ],
    videos: [
      { title: 'Ролик', url: 'https://vkvideo.ru/video_ext.php?oid=1&id=2&hash=3', _order: 1 },
      { title: null, url: 'https://example.org/clip.mp4', _order: 2 },
    ],
    content: lexical('Текст концерта'),
  },
  {
    id: 2,
    title: 'Приглашаем на праздник',
    slug: 'priglashaem-na-prazdnik',
    date: '2026-08-25T10:00:00.000Z',
    publishedAt: null,
    status: 'draft',
    vkPostId: `${OWNER}_2`,
    sourceUrl: `https://vk.com/wall${OWNER}_2`,
    categoryId: 1,
    categorySlug: 'afisha',
    coverId: null,
    coverFilename: null,
    gallery: null,
    videos: null,
    // Афиша-картинка без текста: content пустой, как у трети записей Калинино.
    content: null,
  },
  {
    id: 3,
    title: 'Уже привезена нашим импортом',
    slug: 'uzhe-privezena',
    date: '2026-08-26T10:00:00.000Z',
    publishedAt: '2026-08-26T10:00:00.000Z',
    status: 'published',
    vkPostId: `${OWNER}_3`,
    sourceUrl: null,
    categoryId: 6,
    categorySlug: 'novosti',
    coverId: 14,
    coverFilename: 'vk-ci-3-0.png',
    gallery: null,
    videos: null,
    content: lexical('Новость'),
  },
]

// Повтор адреса внутри выгрузки: у Калинино slug не уникален. Новейшая (id 4)
// оставляет адрес, старшая (id 1) должна получить хвост из vkPostId.
POSTS.push({ ...POSTS[1], id: 4, slug: 'koncert-ko-dnyu-sela', vkPostId: `${OWNER}_4`, status: 'published', publishedAt: '2026-08-27T10:00:00.000Z' })

const CATEGORIES = [
  { id: 1, title: 'Афиша', slug: 'afisha', order: 0 },
  { id: 3, title: 'Концерты и выступления', slug: 'koncerty', order: 2 },
  { id: 6, title: 'Новости', slug: 'novosti', order: 5 },
]

const main = async () => {
  const payload = await getPayload({ config })
  const problems: string[] = []
  const png = Buffer.from(PNG_BASE64, 'base64')

  // Выгрузка на диске — той же формы, что на боксе.
  const dir = await mkdtemp(path.join(tmpdir(), 'kalinino-handover-'))
  await mkdir(path.join(dir, 'media'))
  await writeFile(path.join(dir, 'posts.json'), JSON.stringify(POSTS))
  await writeFile(path.join(dir, 'categories.json'), JSON.stringify(CATEGORIES))
  for (const name of ['vk-ci-1-0.png', 'vk-ci-1-1.png', 'vk-ci-1-2.png', 'vk-ci-3-0.png']) {
    await writeFile(path.join(dir, 'media', name), png)
  }

  const institution = await payload.create({
    collection: 'institutions',
    context: ctx,
    data: {
      title: 'CI: Калинино для проверки переноса',
      slug: 'ci-kalinino',
      shortTitle: 'CI-Калинино',
      theme: 'kalinino',
      // Черновик, как заводит каталог: перенос обязан открыть раздел сам.
      _status: 'draft',
    },
  })

  // Запись под тем же vkUid, что третья в выгрузке, — как будто её уже привёз
  // наш импорт со стены: черновик, свой адрес, своя обложка.
  const ownCover = await payload.create({
    collection: 'media',
    context: ctx,
    data: { alt: 'своя обложка' },
    file: { data: png, name: 'own-cover-ci.png', mimetype: 'image/png', size: png.length },
  })
  await payload.create({
    collection: 'posts',
    context: ctx,
    data: {
      title: 'Наш импорт: запись 3',
      slug: 'nash-import-3-900000021-3',
      institution: institution.id,
      type: 'news',
      source: 'vk',
      vkUid: `${OWNER}_3`,
      cover: ownCover.id,
      content: lexical('Наш текст'),
      _status: 'draft',
    },
  })

  const mediaBefore = (await payload.count({ collection: 'media' })).totalDocs
  const postsBefore = (await payload.count({ collection: 'posts' })).totalDocs

  const opts = { dir, institutionSlug: 'ci-kalinino' }

  // 1. Сухой прогон.
  const dry = await transferKalinino(payload, { ...opts, dryRun: true })
  console.log(`сухой: план создать ${dry.plan.create}, обновить ${dry.plan.update}, коллизий ${dry.collisions.length}`)
  if (!dry.ok || dry.blocked) problems.push(`сухой прогон заблокирован: ${dry.blocked}`)
  if (dry.plan.create !== 3 || dry.plan.update !== 1) problems.push(`план ${dry.plan.create}/${dry.plan.update}, ожидалось 3/1`)
  if (dry.renamed.length !== 1 || dry.renamed[0]?.vkPostId !== `${OWNER}_1`) problems.push(`повтор адреса решён неверно: ${JSON.stringify(dry.renamed)}`)
  if (dry.videos.posts !== 1 || dry.videos.total !== 2) problems.push(`видео в плане ${dry.videos.posts}/${dry.videos.total}, ожидалось 1/2`)
  if (dry.sourceUrl.present !== 3 || dry.sourceUrl.missing !== 1) problems.push(`sourceUrl в плане ${dry.sourceUrl.present}/${dry.sourceUrl.missing}`)
  if (dry.media.files !== 4) problems.push(`файлов медиа в плане ${dry.media.files}, ожидалось 4`)
  if ((await payload.count({ collection: 'posts' })).totalDocs !== postsBefore) problems.push('сухой прогон создал записи')
  if ((await payload.count({ collection: 'media' })).totalDocs !== mediaBefore) problems.push('сухой прогон загрузил медиа')

  // 2. Боевой прогон.
  const first = await transferKalinino(payload, { ...opts, dryRun: false })
  console.log(`боевой: создано ${first.result.created}, обновлено ${first.result.updated}, с ошибкой ${first.result.failed}`)
  if (!first.ok) problems.push(`боевой прогон не ok: ${first.blocked ?? first.messages.at(-1)}`)
  if (first.result.created !== 3 || first.result.updated !== 1 || first.result.failed !== 0)
    problems.push(`результат ${first.result.created}/${first.result.updated}/${first.result.failed}, ожидалось 3/1/0`)
  if (first.media.uploaded !== 3) problems.push(`загружено медиа ${first.media.uploaded}, ожидалось 3`)
  if (first.media.kept !== 1) problems.push(`оставлено своё медиа ${first.media.kept}, ожидалось 1`)
  if (!first.institutionPublished) problems.push('карточка-получатель не опубликована')
  const card = await payload.findByID({ collection: 'institutions', id: institution.id, depth: 0 })
  if (card._status !== 'published') problems.push('раздел остался черновиком после переноса')

  const concert = (
    await payload.find({ collection: 'posts', where: { vkUid: { equals: `${OWNER}_1` } }, depth: 0, limit: 1 })
  ).docs[0]
  if (concert?.slug !== 'koncert-ko-dnyu-sela-900000021-1') problems.push(`старшая запись повтора не получила хвост: «${concert?.slug}»`)
  const newest = (
    await payload.find({ collection: 'posts', where: { vkUid: { equals: `${OWNER}_4` } }, depth: 0, limit: 1 })
  ).docs[0]
  if (newest?.slug !== 'koncert-ko-dnyu-sela') problems.push(`новейшая запись повтора не оставила адрес: «${newest?.slug}»`)
  if (concert?._status !== 'published') problems.push('публикация владельца не перенесена')
  if (!concert?.cover) problems.push('обложка не проставилась')
  if ((concert?.gallery ?? []).length !== 2) problems.push(`в галерее ${(concert?.gallery ?? []).length}, ожидалось 2`)
  if ((concert?.videos ?? []).length !== 2) problems.push(`видео ${(concert?.videos ?? []).length}, ожидалось 2`)
  if (concert?.videos?.[0]?.url !== 'https://vkvideo.ru/video_ext.php?oid=1&id=2&hash=3') problems.push('порядок видео нарушен')
  if (concert?.sourceUrl !== `https://vk.com/wall${OWNER}_1`) problems.push('sourceUrl не перенесён')
  if (concert?.category !== 'Концерты и выступления') problems.push(`рубрика «${concert?.category}»`)
  if (concert?.type !== 'news') problems.push('концерт получил не тот вид')
  if (concert?.source !== 'vk') problems.push('источник не vk')

  const afisha = (
    await payload.find({ collection: 'posts', where: { vkUid: { equals: `${OWNER}_2` } }, depth: 0, limit: 1 })
  ).docs[0]
  if (afisha?.type !== 'event') problems.push('рубрика afisha не стала видом event')
  if (!afisha?.content || !Array.isArray((afisha.content as { root?: { children?: unknown[] } }).root?.children)) problems.push('запись без текста не получила пустой lexical-документ')
  if (dry.emptyContent !== 2) problems.push(`без текста в плане ${dry.emptyContent}, ожидалось 2`)
  if (afisha?._status !== 'draft') problems.push('черновик выгрузки опубликовался')

  const merged = (
    await payload.find({ collection: 'posts', where: { vkUid: { equals: `${OWNER}_3` } }, depth: 0, limit: 1 })
  ).docs[0]
  if (merged?.slug !== 'uzhe-privezena') problems.push(`существующая запись не переименована: «${merged?.slug}»`)
  if (merged?._status !== 'published') problems.push('существующая запись не опубликована')
  if (merged?.cover !== ownCover.id) problems.push('своя обложка существующей записи заменена')
  if ((await payload.count({ collection: 'posts', where: { vkUid: { equals: `${OWNER}_3` } } })).totalDocs !== 1)
    problems.push('запись под тем же vkUid задублировалась')

  // 3. Повторный прогон — идемпотентность.
  const mediaAfterFirst = (await payload.count({ collection: 'media' })).totalDocs
  const second = await transferKalinino(payload, { ...opts, dryRun: false })
  console.log(`повторный: создано ${second.result.created}, обновлено ${second.result.updated}, медиа переиспользовано ${second.media.reused}`)
  if (second.result.created !== 0) problems.push(`повторный прогон создал ${second.result.created}`)
  if (second.result.failed !== 0) problems.push(`повторный прогон: ошибок ${second.result.failed}`)
  if (second.media.uploaded !== 0) problems.push(`повторный прогон загрузил медиа ${second.media.uploaded}`)
  if ((await payload.count({ collection: 'media' })).totalDocs !== mediaAfterFirst) problems.push('число медиа изменилось на повторе')
  if ((await payload.count({ collection: 'posts' })).totalDocs !== postsBefore + 3) problems.push('число записей изменилось на повторе')

  // 4. Коллизия адреса с чужой записью — боевой прогон не начинается.
  await payload.create({
    collection: 'posts',
    context: ctx,
    data: { title: 'Чужая ручная запись', slug: 'chuzhoy-adres', type: 'news', source: 'manual', _status: 'draft' },
  })
  await writeFile(
    path.join(dir, 'posts.json'),
    JSON.stringify([...POSTS, { ...POSTS[1], id: 9, slug: 'chuzhoy-adres', vkPostId: `${OWNER}_9` }]),
  )
  const postsBeforeCollision = (await payload.count({ collection: 'posts' })).totalDocs
  const blocked = await transferKalinino(payload, { ...opts, dryRun: false })
  console.log(`с коллизией: blocked=«${blocked.blocked ?? ''}», коллизий ${blocked.collisions.length}`)
  if (!blocked.blocked || blocked.ok) problems.push('боевой прогон с коллизией не остановлен')
  if (blocked.collisions.length !== 1 || blocked.collisions[0]?.takenBy !== 'ручная запись #' + String(
    (await payload.find({ collection: 'posts', where: { slug: { equals: 'chuzhoy-adres' } }, depth: 0, limit: 1 })).docs[0]?.id,
  ))
    problems.push(`коллизия описана неверно: ${JSON.stringify(blocked.collisions)}`)
  if ((await payload.count({ collection: 'posts' })).totalDocs !== postsBeforeCollision) problems.push('заблокированный прогон что-то записал')

  if (problems.length > 0) {
    console.error('::error::проверка переноса Калинино не прошла:')
    for (const p of problems) console.error(`  - ${p}`)
    process.exit(1)
  }
  console.log('перенос Калинино: план, поля videos/sourceUrl, идемпотентность, слияние по vkUid, коллизия как условие выхода — ок')
  process.exit(0)
}

await main()
