import type { Metadata } from 'next'
import Image from 'next/image'
import config from '@payload-config'
import { getPayload } from 'payload'
import { notFound } from 'next/navigation'

import { SITE_NAME } from '../../../lib/site'
import { withRetry } from '../../../lib/withRetry'
import { RichText } from '../../../lib/RichText'
import { formatPostDate } from '../../../lib/format'

type MediaDoc = { url?: string | null; alt?: string | null; width?: number | null; height?: number | null }
type GalleryItem = { id?: string | null; image?: MediaDoc | string | number | null }
type PostDoc = {
  title?: string | null
  date?: string | null
  publishedAt?: string | null
  category?: string | null
  content?: unknown
  cover?: MediaDoc | string | number | null
  gallery?: GalleryItem[] | null
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
    const post = await getPost(slug)
    if (!post) return {}
    return { title: post.title || SITE_NAME }
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

  return (
    <article>
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
    </article>
  )
}
