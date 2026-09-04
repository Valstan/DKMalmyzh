import type { Metadata } from 'next'
import Link from 'next/link'
import config from '@payload-config'
import { getPayload } from 'payload'
import { notFound } from 'next/navigation'

import { canonicalOf, SITE_NAME } from '../../../lib/site'
import { withRetry } from '../../../lib/withRetry'
import { RichText } from '../../../lib/RichText'
import { formatPostDate } from '../../../lib/format'
import { SectionTheme, themeOf } from '../components/SectionTheme'

type InstitutionDoc = {
  id: string | number
  title?: string | null
  shortTitle?: string | null
  theme?: string | null
  settlement?: string | null
  description?: string | null
  content?: unknown
  address?: string | null
  phone?: string | null
  vkSources?: { id?: string | null; url?: string | null }[] | null
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
      alternates: { canonical: canonicalOf(`/dk/${slug}`) },
      openGraph: { url: canonicalOf(`/dk/${slug}`), title: institution.title || SITE_NAME },
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

  // У части учреждений сообществ несколько: РЦКД печатает и в группе, и на
  // личной странице, у пяти сельских ДК рядом с действующей живёт прежняя.
  const vkLinks = (institution.vkSources ?? [])
    .map((source) => source?.url)
    .filter((url): url is string => Boolean(url))

  const posts = await getPosts(institution.id)
  const events = posts.filter((post) => post.type === 'event')
  const news = posts.filter((post) => post.type !== 'event')

  return (
    <SectionTheme theme={themeOf(institution)}>
    <article>
      <p className="eyebrow eyebrow--crumbs">
        <Link href="/dk">Дома культуры района</Link>
        {institution.settlement ? ` · ${institution.settlement}` : ''}
      </p>
      <h1>{institution.title}</h1>
      {institution.description ? <p className="hero__subtitle">{institution.description}</p> : null}

      <RichText data={institution.content} />

      {institution.address || institution.phone || vkLinks.length > 0 ? (
        <section className="institution-block">
          <h2>Контакты</h2>
          {institution.address ? <p>{institution.address}</p> : null}
          {institution.phone ? <p>{institution.phone}</p> : null}
          {vkLinks.map((url, i) => (
            <p key={url}>
              <a href={url} rel="noopener" target="_blank">
                {vkLinks.length > 1 ? `Сообщество ВКонтакте (${i + 1})` : 'Сообщество ВКонтакте'}
              </a>
            </p>
          ))}
        </section>
      ) : null}

      {events.length > 0 ? (
        <section className="institution-block">
          <p className="eyebrow">Не пропустите</p>
          <h2>Афиша</h2>
          <PostList posts={events} />
        </section>
      ) : null}

      <section className="institution-block">
        <h2>Новости</h2>
        {news.length === 0 ? (
          <p className="muted">Пока нет новостей.</p>
        ) : (
          <PostList posts={news} />
        )}
      </section>
    </article>
    </SectionTheme>
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
