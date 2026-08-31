import Link from 'next/link'
import config from '@payload-config'
import { getPayload } from 'payload'

import { withRetry } from '../../../lib/withRetry'
import { formatPostDate } from '../../../lib/format'
import { institutionBadge, institutionHref, institutionLabel } from '../../../lib/institutions'

type PostListItem = {
  id: string | number
  title?: string | null
  slug?: string | null
  date?: string | null
  publishedAt?: string | null
  category?: string | null
  type?: string | null
  institution?: unknown
}

async function getPosts(): Promise<PostListItem[]> {
  try {
    return await withRetry(async () => {
      const payload = await getPayload({ config })
      const res = await payload.find({
        collection: 'posts',
        where: { _status: { equals: 'published' } },
        sort: '-date',
        // depth: 1 — в общей ленте у каждой карточки бейдж своего дома культуры.
        depth: 1,
        limit: 100,
      })
      return res.docs as PostListItem[]
    })
  } catch {
    return []
  }
}

export async function NewsView() {
  const posts = await getPosts()

  return (
    <section>
      <h1>Новости</h1>
      {posts.length === 0 ? (
        <p className="muted">Пока нет новостей.</p>
      ) : (
        <ul className="post-list">
          {posts.map((post) => (
            <li key={post.id} className="post-list__item">
              <h2>
                <Link href={`/news/${encodeURIComponent(post.slug ?? '')}`}>
                  {post.title || 'Без заголовка'}
                </Link>
              </h2>
              <p className="post-list__meta">
                {post.type === 'event' ? 'Афиша · ' : ''}
                {formatPostDate(post.date || post.publishedAt)}
                {post.category ? ` · ${post.category}` : ''}
                <PostInstitution institution={post.institution} />
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// Бейдж учреждения. Материал без привязки — общерайонный, бейджа не получает.
function PostInstitution({ institution }: { institution: unknown }) {
  const ref = institutionBadge(institution)
  if (!ref) return null
  return (
    <>
      {' · '}
      <Link href={institutionHref(ref)}>{institutionLabel(ref)}</Link>
    </>
  )
}
