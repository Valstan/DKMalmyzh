import type { Metadata } from 'next'
import Link from 'next/link'
import config from '@payload-config'
import { getPayload } from 'payload'
import { notFound } from 'next/navigation'

import { canonicalOf, SITE_NAME } from '../../../lib/site'
import { withRetry } from '../../../lib/withRetry'
import { RichText } from '../../../lib/RichText'
import { SectionTheme, themeOf } from '../components/SectionTheme'
import { PostCards, type PostCardDoc } from '../components/PostCard'

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
  website?: string | null
  vkSources?: { id?: string | null; url?: string | null }[] | null
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
//
// depth: 1 — карточкам нужна обложка объектом с `sizes`; при `depth: 0` приходит
// только идентификатором, и превью рисовать нечего. Бейдж своего ДК внутри его
// раздела не показываем, а вот `institution` при depth: 1 достаётся вместе с
// обложкой — лишний вес одной выборки, зато без второй схемы данных.
async function getPosts(institutionId: string | number): Promise<PostCardDoc[]> {
  try {
    return await withRetry(async () => {
      const payload = await getPayload({ config })
      const res = await payload.find({
        collection: 'posts',
        where: { institution: { equals: institutionId }, _status: { equals: 'published' } },
        sort: '-date',
        depth: 1,
        limit: 50,
      })
      return res.docs as PostCardDoc[]
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

  // Личный домен учреждения (у РЦКД — алиас портала, у Калинино — 301 сюда).
  const website = (institution.website || '').trim()
  const hasWebsite = /^https?:\/\//i.test(website)

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

      {institution.address || institution.phone || hasWebsite || vkLinks.length > 0 ? (
        <section className="institution-block">
          <h2>Контакты</h2>
          {institution.address ? <p>{institution.address}</p> : null}
          {institution.phone ? <p>{institution.phone}</p> : null}
          {hasWebsite ? (
            <p>
              <a href={website}>Сайт учреждения</a>
            </p>
          ) : null}
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
          <PostCards posts={events} showInstitution={false} showType={false} />
        </section>
      ) : null}

      <section className="institution-block">
        <h2>Новости</h2>
        {news.length === 0 ? (
          <p className="muted">Пока нет новостей.</p>
        ) : (
          <PostCards posts={news} showInstitution={false} />
        )}
      </section>
    </article>
    </SectionTheme>
  )
}
