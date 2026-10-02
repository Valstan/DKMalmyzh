import type { Metadata } from 'next'
import Image from 'next/image'
import config from '@payload-config'
import { getPayload } from 'payload'
import { notFound } from 'next/navigation'

import { canonicalOf, SITE_NAME } from '../../../lib/site'
import { withRetry } from '../../../lib/withRetry'
import { RichText } from '../../../lib/RichText'
import { formatPostDate } from '../../../lib/format'
import { lexicalText, postDescription } from '../../../lib/posts/excerpt'
import { articleJsonLd, eventJsonLd } from '../../../lib/jsonLd'
import { JsonLd } from '../components/JsonLd'
import { SectionTheme, themeOf } from '../components/SectionTheme'

type MediaDoc = {
  url?: string | null
  alt?: string | null
  width?: number | null
  height?: number | null
  sizes?: { wide?: { url?: string | null } | null; card?: { url?: string | null } | null } | null
}
type GalleryItem = { id?: string | null; image?: MediaDoc | string | number | null }
type VideoItem = { id?: string | null; title?: string | null; url?: string | null }
type PostDoc = {
  title?: string | null
  date?: string | null
  publishedAt?: string | null
  type?: string | null
  category?: string | null
  content?: unknown
  cover?: MediaDoc | string | number | null
  gallery?: GalleryItem[] | null
  videos?: VideoItem[] | null
  institution?: unknown
}

// Имя дома культуры для описания страницы. Связь приходит объектом (depth: 1);
// у записи без дома остаётся null — тогда описание построится по заголовку.
function institutionTitleOf(institution: unknown): string | null {
  if (!institution || typeof institution !== 'object') return null
  const title = (institution as { title?: unknown }).title
  return typeof title === 'string' && title.trim() ? title : null
}

// Абсолютный адрес картинки записи для og:image и JSON-LD. Относительный не
// годится: мессенджер и поисковик открывают разметку со своей стороны, и
// «/media/x.jpg» для них — не наш домен. Берём `card` (768px) — это ровно тот
// кадр, который уже грузится в ленте, и он не тянет original на 2 МБ.
function absoluteImageUrl(cover: MediaDoc | null): string | null {
  const url = cover?.sizes?.card?.url || cover?.url
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  return canonicalOf(url)
}

// Видео записи: mp4 — нативный плеер, плеер ВК (video_ext.php) — кадр, прочее —
// ссылка. Три формы, потому что три формы и приходят из ВК; неизвестный адрес
// не прячем, а показываем ссылкой — потерять видео молча нельзя (#279).
function VideoBlock({ video, fallbackTitle }: { video: VideoItem; fallbackTitle: string }) {
  const url = video.url ?? ''
  const title = video.title || fallbackTitle
  if (/\.mp4(\?|$)/i.test(url)) {
    return <video className="post-video" src={url} controls preload="metadata" title={title} />
  }
  if (/video_ext\.php/.test(url)) {
    return (
      <iframe
        className="post-video"
        src={url}
        title={title}
        allow="autoplay; fullscreen; encrypted-media"
        allowFullScreen
      />
    )
  }
  return (
    <p>
      <a href={url} rel="noopener" target="_blank">
        {title}
      </a>
    </p>
  )
}

async function getPost(slug: string): Promise<PostDoc | null> {
  return withRetry(async () => {
    const payload = await getPayload({ config })
    const res = await payload.find({
      collection: 'posts',
      where: { slug: { equals: slug }, _status: { equals: 'published' } },
      depth: 1,
      limit: 1,
    })
    return (res.docs[0] as PostDoc | undefined) ?? null
  })
}

export async function postMeta(slug: string): Promise<Metadata> {
  try {
    // ⚠️ Slug декодируется ЗДЕСЬ, а не только в теле страницы: `params.slug`
    // приходит percent-encoded (в базе 94% адресов — кириллические), и поиск
    // по сырой строке не находит документ. `catch` внизу глотал это молча:
    // 784 страницы из 835 отдавали generic title/description из layout и
    // ВООБЩЕ не имели canonical — робот видел дубли, а соцсеть — карточку
    // главной. Тело страницы страдало меньше (там decode был), поэтому баг
    // жил незамеченным.
    const post = await getPost(decodeURIComponent(slug))
    if (!post) return {}
    const canonical = canonicalOf(`/news/${slug}`)
    const title = post.title || SITE_NAME
    // Описание строим по тексту записи: до этого все новости отдавали ОДИН
    // description из layout, и поисковик показывал одинаковый сниппет.
    const description = postDescription({
      text: lexicalText(post.content),
      title: post.title,
      institutionTitle: institutionTitleOf(post.institution),
    })
    // og:image — кадр записи; у записи без фото остаётся общая обложка портала,
    // иначе ссылка разворачивается пустой карточкой без картинки.
    const imageUrl = absoluteImageUrl(
      typeof post.cover === 'object' && post.cover ? (post.cover as MediaDoc) : null,
    )
    const ogImage = imageUrl ?? canonicalOf('/og.png')
    return {
      title: post.title || SITE_NAME,
      description,
      alternates: { canonical },
      openGraph: {
        url: canonical,
        title,
        description,
        type: 'article',
        images: [ogImage],
      },
      twitter: { card: 'summary_large_image' },
    }
  } catch {
    return {}
  }
}

export async function PostView({ slug }: { slug: string }) {
  const post = await getPost(decodeURIComponent(slug))
  if (!post) notFound()

  const cover = typeof post.cover === 'object' && post.cover ? (post.cover as MediaDoc) : null

  // Галерея импорта из ВК. Картинки живут отдельным полем, а не upload-узлами
  // внутри richText: наш RichText сложные узлы не рисует, и фото исчезли бы со
  // страницы молча. Элементы без url отсеиваем — depth мог не дотянуть связь.
  const gallery = (post.gallery ?? [])
    .map((item) => (typeof item?.image === 'object' && item.image ? (item.image as MediaDoc) : null))
    .filter((image): image is MediaDoc => Boolean(image?.url))

  const videos = (post.videos ?? []).filter((v) => typeof v?.url === 'string' && v.url)

  // Структурированные данные. Афиши (type: 'event') размечаются как Event —
  // поисковик показывает их блоком событий с датой, а не строчкой новости.
  const imageUrl = absoluteImageUrl(cover)
  const description = postDescription({
    text: lexicalText(post.content),
    title: post.title,
    institutionTitle: institutionTitleOf(post.institution),
  })
  const jsonLd =
    post.type === 'event'
      ? eventJsonLd({
          slug,
          title: post.title || '',
          description,
          date: post.date,
          imageUrl,
          institutionTitle: institutionTitleOf(post.institution),
        })
      : articleJsonLd({
          slug,
          title: post.title || '',
          description,
          date: post.date,
          publishedAt: post.publishedAt,
          imageUrl,
          category: post.category,
          institutionTitle: institutionTitleOf(post.institution),
        })

  return (
    <SectionTheme theme={themeOf(post.institution)}>
    <article>
      <JsonLd data={jsonLd} />
      <h1>{post.title}</h1>
      <p className="post-list__meta">
        {formatPostDate(post.date || post.publishedAt)}
        {post.category ? ` · ${post.category}` : ''}
      </p>
      {cover?.url ? (
        <Image
          className="post-cover"
          src={cover.url}
          alt={cover.alt || post.title || ''}
          width={cover.width || 1200}
          height={cover.height || 675}
        />
      ) : null}
      <RichText data={post.content} />

      {gallery.length > 0 ? (
        <section className="post-gallery">
          {gallery.map((image, i) => (
            <Image
              key={image.url ?? i}
              className="post-cover"
              src={image.url as string}
              alt={image.alt || post.title || ''}
              width={image.width || 1200}
              height={image.height || 675}
            />
          ))}
        </section>
      ) : null}

      {videos.length > 0 ? (
        <section className="post-videos">
          {videos.map((video, i) => (
            <VideoBlock key={video.id ?? i} video={video} fallbackTitle={post.title || 'Видео'} />
          ))}
        </section>
      ) : null}
    </article>
    </SectionTheme>
  )
}
