import { access, readFile } from 'fs/promises'
import path from 'path'
import type { Payload } from 'payload'

import type { Post } from '../../payload-types'

import { describeError } from '../vk/import'
import {
  categoryLabelFor,
  contentFor,
  findSlugCollisions,
  mediaFilenamesOf,
  normalizeVideos,
  parseHandover,
  postTypeFor,
  resolveHandoverDuplicates,
  type SlugCollision,
  type SlugRename,
  type TransferablePost,
} from './handover'

// Перенос записей Калинино из выгрузки (D-074) в раздел портала.
//
// Почему перенос из выгрузки, а не повторный импорт со стены: у 46 записей есть
// решение владельца о публикации, рубрики от переразбора 22.08 и обложки —
// повторный импорт всё это потерял бы, а шлюз потратил бы десятки вызовов.
// Ключ идемпотентности общий: их `vkPostId` = наш `vkUid` (owner_post), поэтому
// запись, уже привезённая нашим импортом со стены Калинино, — тот же документ:
// она обновляется, а не дублируется.
//
// Три условия Мозга до первой записи в прод (письмо 04.09) держатся здесь:
//  1. `videos` и `sourceUrl` переносятся в одноимённые поля — не теряются молча,
//     числа по ним в отчёте;
//  2. коллизии адресов — УСЛОВИЕ ВЫХОДА, а не строка в логе: боевой прогон не
//     начинается, пока есть хоть одна; `?dry=1` печатает их список;
//  3. приёмка редиректов — не здесь, а в switch-kalinino-domain.yml после
//     переключения имени.
//
// Отчёт не печатает путей бокса (D-038): каталог называется по basename.

export type TransferOptions = {
  /** Абсолютный путь к каталогу выгрузки на боксе (уже проверенный по форме). */
  dir: string
  dryRun: boolean
  /** slug учреждения-получателя; по умолчанию kalinino. */
  institutionSlug?: string
  log?: (message: string) => void
}

export type TransferSummary = {
  ok: boolean
  dryRun: boolean
  dir: string
  institution: string
  /** Почему прогон не начат (боевой) либо не может начаться (сухой). */
  blocked?: string
  source: {
    posts: number
    published: number
    drafts: number
    withoutKey: number
    categories: number
  }
  plan: { create: number; update: number }
  collisions: SlugCollision[]
  /** Повторы адресов внутри выгрузки, решённые автоматически (см. handover.ts). */
  renamed: SlugRename[]
  media: {
    files: number
    missing: number
    uploaded: number
    reused: number
    kept: number
  }
  /** Записей без текста (только картинка/видео) — переносятся с пустым абзацем. */
  emptyContent: number
  videos: { posts: number; total: number }
  sourceUrl: { present: number; missing: number }
  categories: Record<string, number>
  result: { created: number; updated: number; failed: number }
  messages: string[]
}

type PostRow = {
  id: number | string
  slug?: string | null
  vkUid?: string | null
  cover?: number | string | null
  gallery?: { image?: number | string | null }[] | null
  _status?: string | null
}

type InstitutionRow = { id: number; slug?: string | null }

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
}

export async function transferKalinino(
  payload: Payload,
  options: TransferOptions,
): Promise<TransferSummary> {
  const { dir, dryRun, institutionSlug = 'kalinino', log } = options
  const summary: TransferSummary = {
    ok: false,
    dryRun,
    dir: path.basename(dir),
    institution: institutionSlug,
    source: { posts: 0, published: 0, drafts: 0, withoutKey: 0, categories: 0 },
    plan: { create: 0, update: 0 },
    collisions: [],
    renamed: [],
    media: { files: 0, missing: 0, uploaded: 0, reused: 0, kept: 0 },
    emptyContent: 0,
    videos: { posts: 0, total: 0 },
    sourceUrl: { present: 0, missing: 0 },
    categories: {},
    result: { created: 0, updated: 0, failed: 0 },
    messages: [],
  }
  const say = (message: string) => {
    summary.messages.push(message)
    log?.(message)
  }

  // 1. Выгрузка с диска.
  const postsRaw = await readJson(path.join(dir, 'posts.json'))
  const categoriesRaw = await readJson(path.join(dir, 'categories.json'))
  const mediaDir = path.join(dir, 'media')
  const { posts, withoutKey, categories } = parseHandover(postsRaw, categoriesRaw)

  summary.source = {
    posts: posts.length,
    published: posts.filter((p) => p.status === 'published').length,
    drafts: posts.filter((p) => p.status !== 'published').length,
    withoutKey: withoutKey.length,
    categories: categories.size,
  }
  if (withoutKey.length > 0) {
    say(`записей без vkPostId или slug: ${withoutKey.length} — переносить нечем, в отчёте`)
  }
  if (posts.length === 0) {
    summary.blocked = 'в posts.json нет ни одной переносимой записи'
    say(summary.blocked)
    return summary
  }

  // 2. Получатель — карточка учреждения (основная запись, не версия).
  const institutions = await payload.find({
    collection: 'institutions',
    where: { slug: { equals: institutionSlug } },
    depth: 0,
    limit: 1,
  })
  const institution = institutions.docs[0] as InstitutionRow | undefined
  if (!institution) {
    summary.blocked = `учреждение «${institutionSlug}» не найдено — сначала seed-institutions`
    say(summary.blocked)
    return summary
  }

  // 3. Что уже есть в базе. Основные записи, без `draft: true`: адрес страницы и
  // ключ vkUid живут в таблице posts, а не в версиях (грабля операции reslug).
  const existing = await payload.find({
    collection: 'posts',
    depth: 0,
    limit: 0,
    pagination: false,
  })
  const byVkUid = new Map<string, PostRow>()
  const bySlug = new Map<string, { vkUid?: string | null; id: number | string }>()
  for (const doc of existing.docs as PostRow[]) {
    if (typeof doc.vkUid === 'string' && doc.vkUid) byVkUid.set(doc.vkUid, doc)
    if (typeof doc.slug === 'string' && doc.slug) bySlug.set(doc.slug, { vkUid: doc.vkUid, id: doc.id })
  }

  // 4. Повторы внутри выгрузки решаются как на их сайте; коллизии с чужими
  // записями портала — условие выхода.
  summary.renamed = resolveHandoverDuplicates(posts)
  for (const r of summary.renamed) {
    say(`адрес «${r.from}» повторяется в выгрузке: запись ${r.vkPostId} получает «${r.to}» (новейшая оставляет адрес)`)
  }
  summary.collisions = findSlugCollisions(posts, bySlug)
  for (const c of summary.collisions) {
    say(
      `коллизия адреса «${c.slug}»: из выгрузки ${c.incoming.join(', ')}` +
        (c.takenBy ? `; в базе занят — ${c.takenBy}` : ' (дубль внутри выгрузки)'),
    )
  }

  // 5. План по записям: создать/обновить, медиа на диске, видео, провенанс.
  const missingByPost = new Map<string, string[]>()
  for (const post of posts) {
    const current = byVkUid.get(post.vkPostId)
    if (current) summary.plan.update += 1
    else summary.plan.create += 1

    const files = mediaFilenamesOf(post)
    summary.media.files += files.length
    const missing: string[] = []
    for (const name of files) {
      if (!(await exists(path.join(mediaDir, name)))) missing.push(name)
    }
    if (missing.length > 0) {
      summary.media.missing += missing.length
      missingByPost.set(post.vkPostId, missing)
      say(`запись ${post.vkPostId}: нет файлов на диске — ${missing.join(', ')}`)
    }

    const videos = normalizeVideos(post.videos)
    if (videos.length > 0) {
      summary.videos.posts += 1
      summary.videos.total += videos.length
    }
    if (typeof post.sourceUrl === 'string' && post.sourceUrl.trim()) summary.sourceUrl.present += 1
    else summary.sourceUrl.missing += 1

    const label = categoryLabelFor(post.categorySlug, categories) ?? '(без рубрики)'
    summary.categories[label] = (summary.categories[label] ?? 0) + 1

    if (post.content === null || post.content === undefined) summary.emptyContent += 1
    else if (!contentFor(post.content)) {
      say(`запись ${post.vkPostId}: content не lexical-документ — запись будет пропущена`)
    }
  }

  say(
    `план: создать ${summary.plan.create}, обновить ${summary.plan.update}; ` +
      `медиа ${summary.media.files} файлов, отсутствует ${summary.media.missing}; ` +
      `без текста ${summary.emptyContent}; видео у ${summary.videos.posts} записей (${summary.videos.total}); ` +
      `sourceUrl есть у ${summary.sourceUrl.present}, нет у ${summary.sourceUrl.missing}; ` +
      `коллизий адресов ${summary.collisions.length}, переназначено внутри выгрузки ${summary.renamed.length}`,
  )

  if (summary.collisions.length > 0) {
    summary.blocked = `коллизий адресов: ${summary.collisions.length} — перенос не начинается, пока каждая не решена`
    say(summary.blocked)
    return summary
  }

  if (dryRun) {
    summary.ok = true
    return summary
  }

  // 6. Боевой прогон.
  for (const post of posts) {
    try {
      const content = contentFor(post.content)
      if (!content) {
        summary.result.failed += 1
        continue
      }
      if (missingByPost.has(post.vkPostId)) {
        // Запись с недостающими файлами не переносится частично: половина
        // галереи, отрапортованная как успех, — тот же класс потери (#279).
        summary.result.failed += 1
        say(`запись ${post.vkPostId}: не перенесена — не хватает файлов медиа`)
        continue
      }

      const current = byVkUid.get(post.vkPostId)
      const mediaIds = await mediaFor(payload, post, current, mediaDir, summary, say)

      const status: 'published' | 'draft' = post.status === 'published' ? 'published' : 'draft'
      const date = post.date || post.publishedAt || post.createdAt || new Date().toISOString()
      const data = {
        title: post.title,
        slug: post.slug,
        date,
        publishedAt: post.publishedAt || undefined,
        institution: institution.id,
        type: postTypeFor(post.categorySlug),
        category: categoryLabelFor(post.categorySlug, categories),
        source: 'vk' as const,
        vkUid: post.vkPostId,
        sourceUrl: typeof post.sourceUrl === 'string' ? post.sourceUrl.trim() || undefined : undefined,
        content: content as Post['content'],
        videos: normalizeVideos(post.videos),
        ...(mediaIds
          ? { cover: mediaIds[0], gallery: mediaIds.slice(1).map((image) => ({ image })) }
          : {}),
        _status: status,
      }

      const id = current
        ? (
            await payload.update({
              collection: 'posts',
              id: current.id,
              context: { disableRevalidate: status !== 'published' },
              data,
            })
          ).id
        : (
            await payload.create({
              collection: 'posts',
              context: { disableRevalidate: status !== 'published' },
              data,
            })
          ).id

      // Приёмка по факту: перечитываем основную запись и сверяем адрес и статус.
      const check = (await payload.findByID({ collection: 'posts', id, depth: 0 })) as PostRow
      if (check?.slug !== post.slug || check?._status !== status) {
        summary.result.failed += 1
        say(
          `запись ${post.vkPostId}: после записи в базе адрес «${check?.slug ?? '—'}», ` +
            `статус «${check?._status ?? '—'}» — ожидалось «${post.slug}», «${status}»`,
        )
        continue
      }

      if (current) summary.result.updated += 1
      else summary.result.created += 1
      byVkUid.set(post.vkPostId, check)
    } catch (err) {
      summary.result.failed += 1
      say(`запись ${post.vkPostId}: не перенесена — ${describeError(err)}`)
    }
  }

  say(
    `итог: создано ${summary.result.created}, обновлено ${summary.result.updated}, ` +
      `с ошибкой ${summary.result.failed}; медиа загружено ${summary.media.uploaded}, ` +
      `переиспользовано ${summary.media.reused}, оставлено своё ${summary.media.kept}; ` +
      `видео перенесено ${summary.videos.total} в поле videos, sourceUrl — ${summary.sourceUrl.present}`,
  )
  summary.ok = summary.result.failed === 0
  return summary
}

/**
 * Медиа записи: id в нашей коллекции в порядке «обложка, галерея».
 *
 * Возвращает null, когда медиа трогать не нужно: у уже существующей записи есть
 * обложка (её привёз наш импорт со стены — те же фото), и повторная загрузка
 * из выгрузки оставила бы в Media вторую копию каждого файла. Ровно такой класс
 * сирот Калинино нашло у себя после переимпорта.
 */
async function mediaFor(
  payload: Payload,
  post: TransferablePost,
  current: PostRow | undefined,
  mediaDir: string,
  summary: TransferSummary,
  say: (m: string) => void,
): Promise<number[] | null> {
  const files = mediaFilenamesOf(post)
  if (files.length === 0) return []

  if (current?.cover) {
    summary.media.kept += files.length
    return null
  }

  const ids: number[] = []
  for (const name of files) {
    const found = await payload.find({
      collection: 'media',
      where: { filename: { equals: name } },
      depth: 0,
      limit: 1,
    })
    if (found.docs[0]) {
      ids.push(found.docs[0].id as number)
      summary.media.reused += 1
      continue
    }

    const buffer = await readFile(path.join(mediaDir, name))
    const doc = await payload.create({
      collection: 'media',
      context: { disableRevalidate: true },
      data: { alt: post.title },
      file: {
        data: buffer,
        name,
        mimetype: MIME_BY_EXT[path.extname(name).toLowerCase()] ?? 'image/jpeg',
        size: buffer.length,
      },
    })
    ids.push(doc.id as number)
    summary.media.uploaded += 1
  }
  if (ids.length !== files.length) say(`запись ${post.vkPostId}: медиа ${ids.length} из ${files.length}`)
  return ids
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, 'utf8')) as unknown
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}
