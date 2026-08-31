import type { Metadata } from 'next'
import Link from 'next/link'
import config from '@payload-config'
import { getPayload } from 'payload'
import { notFound } from 'next/navigation'

import { SITE_NAME } from '../../../lib/site'
import { withRetry } from '../../../lib/withRetry'
import { RichText } from '../../../lib/RichText'
import { formatPostDate } from '../../../lib/format'

type InstitutionDoc = {
  id: string | number
  title?: string | null
  shortTitle?: string | null
  settlement?: string | null
  description?: string | null
  content?: unknown
  address?: string | null
  phone?: string | null
  vkGroupUrl?: string | null
}

type PostListItem = {
  id: string | number
  title?: string | null
  slug?: string | null
  date?: string | null
  publishedAt?: string | null
  type?: string | null
}

async function getInstitution(slug: string): Promise<InstitutionDoc | null> {
  return withRetry(async () => {
    const payload = await getPayload({ config })
    const res = await payload.find({
      collection: 'institutions',
      where: { slug: { equals: slug }, _status: { equals: 'published' } },
      depth: 0,
      limit: 1,
    })
    return (res.docs[0] as InstitutionDoc | undefined) ?? null
  })
}

// Лента учреждения. Мягкая деградация к []: сбой выборки материалов не должен
// прятать саму карточку дома культуры — адрес и телефон нужнее ленты.
async function getPosts(institutionId: string | number): Promise<PostListItem[]> {
  try {
    return await withRetry(async () => {
      const payload = await getPayload({ config })
      const res = await payload.find({
        collection: 'posts',
        where: { institution: { equals: institutionId }, _status: { equals: 'published' } },
        sort: '-date',
        depth: 0,
        limit: 50,
      })
      return res.docs as PostListItem[]
    })
  } catch {
    return []
  }
}

export async function institutionMeta(slug: string): Promise<Metadata> {
  try {
    const institution = await getInstitution(decodeURIComponent(slug))
    if (!institution) return {}
    return {
      title: institution.title || SITE_NAME,
      description: institution.description || undefined,
    }
  } catch {
    return {}
  }
}

export async function InstitutionView({ slug }: { slug: string }) {
  // Сбой чтения пробрасываем (не кэшируем ложный 404 под ISR); реальное
  // отсутствие → notFound().
  const institution = await getInstitution(decodeURIComponent(slug))
  if (!institution) notFound()

  const posts = await getPosts(institution.id)
  const events = posts.filter((post) => post.type === 'event')
  const news = posts.filter((post) => post.type !== 'event')

  return (
    <article>
      <p className="eyebrow">
        <Link href="/dk">Дома культуры района</Link>
        {institution.settlement ? ` · ${institution.settlement}` : ''}
      </p>
      <h1>{institution.title}</h1>
      {institution.description ? <p className="hero__subtitle">{institution.description}</p> : null}

      <RichText data={institution.content} />

      {institution.address || institution.phone || institution.vkGroupUrl ? (
        <section className="contacts-section ornate-frame">
          <h2>Контакты</h2>
          {institution.address ? <p>{institution.address}</p> : null}
          {institution.phone ? <p>{institution.phone}</p> : null}
          {institution.vkGroupUrl ? (
            <p>
              <a href={institution.vkGroupUrl} rel="noopener" target="_blank">
                Сообщество ВКонтакте
              </a>
            </p>
          ) : null}
        </section>
      ) : null}

      {events.length > 0 ? (
        <section className="news-section paint-frame">
          <div className="section-heading section-heading--left">
            <p className="eyebrow">Не пропустите</p>
            <h2>Афиша</h2>
          </div>
          <PostList posts={events} />
        </section>
      ) : null}

      <section className="news-section paint-frame">
        <div className="section-heading section-heading--left">
          <h2>Новости</h2>
        </div>
        {news.length === 0 ? (
          <p className="muted">Пока нет новостей.</p>
        ) : (
          <PostList posts={news} />
        )}
      </section>
    </article>
  )
}

function PostList({ posts }: { posts: PostListItem[] }) {
  return (
    <ul className="post-list">
      {posts.map((post) => (
        <li key={post.id} className="post-list__item">
          <h3>
            <Link href={`/news/${encodeURIComponent(post.slug ?? '')}`}>
              {post.title || 'Без заголовка'}
            </Link>
          </h3>
          <p className="post-list__meta">{formatPostDate(post.date || post.publishedAt)}</p>
        </li>
      ))}
    </ul>
  )
}
