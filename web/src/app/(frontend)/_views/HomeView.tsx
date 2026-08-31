import Link from 'next/link'
import Image from 'next/image'
import config from '@payload-config'
import { getPayload } from 'payload'

import { SITE_NAME } from '../../../lib/site'
import { withRetry } from '../../../lib/withRetry'
import { formatPostDate } from '../../../lib/format'
import { institutionBadge, institutionHref, institutionLabel } from '../../../lib/institutions'

type Home = {
  title?: string | null
  subtitle?: string | null
  intro?: string | null
  contacts?: string | null
}

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

async function getHome(): Promise<Home | null> {
  try {
    return await withRetry(async () => {
      const payload = await getPayload({ config })
      return (await payload.findGlobal({ slug: 'home', depth: 0 })) as Home
    })
  } catch {
    return null
  }
}

async function getLatestPosts(): Promise<PostListItem[]> {
  try {
    return await withRetry(async () => {
      const payload = await getPayload({ config })
      const res = await payload.find({
        collection: 'posts',
        where: { _status: { equals: 'published' } },
        sort: '-date',
        // depth: 1 — в общей ленте портала у каждой карточки бейдж своего ДК.
        depth: 1,
        limit: 6,
      })
      return res.docs as PostListItem[]
    })
  } catch {
    return []
  }
}

// Ближайшие афиши: только вперёд по времени и по возрастанию даты — прошедшее
// мероприятие в блоке «не пропустите» хуже, чем пустой блок.
async function getUpcomingEvents(): Promise<PostListItem[]> {
  try {
    return await withRetry(async () => {
      const payload = await getPayload({ config })
      const res = await payload.find({
        collection: 'posts',
        where: {
          _status: { equals: 'published' },
          type: { equals: 'event' },
          date: { greater_than_equal: new Date().toISOString() },
        },
        sort: 'date',
        depth: 1,
        limit: 4,
      })
      return res.docs as PostListItem[]
    })
  } catch {
    return []
  }
}

export async function HomeView() {
  const [home, posts, events] = await Promise.all([
    getHome(),
    getLatestPosts(),
    getUpcomingEvents(),
  ])

  return (
    <>
      <section className="hero">
        <div className="hero__confetti" aria-hidden="true">
          ✦ ● ❀ ♪ ✺ ● ♫ ✦
        </div>
        <div className="hero__copy">
          <p className="eyebrow">Малмыж встречает друзей</p>
          <h1>{home?.title || SITE_NAME}</h1>
          <p className="hero__subtitle">
            {home?.subtitle || 'Здесь будни уступают место музыке, танцу и ярким встречам'}
          </p>
          {home?.intro ? <p className="hero__intro">{home.intro}</p> : null}
          <div className="hero__actions">
            <Link className="button button--primary" href="/news">
              Афиша и новости
            </Link>
            <Link className="button button--secondary" href="/dk">
              Дома культуры района
            </Link>
          </div>
        </div>
        <div className="hero__art" aria-hidden="true">
          <div className="hero__sunburst" />
          <Image src="/brand/mary-emblem.png" alt="" width={1254} height={1254} priority />
        </div>
      </section>

      <section id="celebration" className="celebration-section ornate-frame">
        <div className="section-heading">
          <p className="eyebrow">Культура объединяет</p>
          <h2>Целая вселенная праздника</h2>
          <p>От народных традиций до большой сцены — здесь каждый найдёт свой ритм.</p>
        </div>
        <div className="celebration-grid">
          <article className="celebration-card celebration-card--sun">
            <span aria-hidden="true">☀</span>
            <h3>Сабантуй</h3>
            <p>Сила земли, звонкие песни, игры и щедрое гостеприимство.</p>
          </article>
          <article className="celebration-card celebration-card--berry">
            <span aria-hidden="true">♫</span>
            <h3>Концерты</h3>
            <p>Живой звук, свет софитов и эмоции, которыми хочется делиться.</p>
          </article>
          <article className="celebration-card celebration-card--blue">
            <span aria-hidden="true">❋</span>
            <h3>Казанская</h3>
            <p>Любимый городской праздник с теплом малмыжских традиций.</p>
          </article>
          <article className="celebration-card celebration-card--green">
            <span aria-hidden="true">✦</span>
            <h3>Танец и театр</h3>
            <p>Сказочные образы, вихрь движения и радость творчества.</p>
          </article>
        </div>
      </section>

      {events.length > 0 ? (
        <section className="news-section paint-frame">
          <div className="section-heading section-heading--left">
            <p className="eyebrow">Не пропустите</p>
            <h2>Ближайшие события</h2>
          </div>
          <ul className="post-list">
            {events.map((event) => (
              <li key={event.id} className="post-list__item">
                <h3>
                  <Link href={`/news/${encodeURIComponent(event.slug ?? '')}`}>
                    {event.title || 'Без заголовка'}
                  </Link>
                </h3>
                <p className="post-list__meta">
                  {formatPostDate(event.date || event.publishedAt)}
                  <PostInstitution institution={event.institution} />
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="news-section paint-frame">
        <div className="section-heading section-heading--left">
          <p className="eyebrow">Со всего района</p>
          <h2>Новости домов культуры</h2>
        </div>
        {posts.length === 0 ? (
          <div className="empty-news">
            <span aria-hidden="true">🎭</span>
            <div>
              <h3>Скоро здесь станет шумно!</h3>
              <p>Готовим первые анонсы, встречи и праздничные новости.</p>
            </div>
          </div>
        ) : (
          <ul className="post-list">
            {posts.map((post) => (
              <li key={post.id} className="post-list__item">
                <h3>
                  <Link href={`/news/${encodeURIComponent(post.slug ?? '')}`}>
                    {post.title || 'Без заголовка'}
                  </Link>
                </h3>
                <p className="post-list__meta">
                  {post.type === 'event' ? 'Афиша · ' : ''}
                  {formatPostDate(post.date || post.publishedAt)}
                  <PostInstitution institution={post.institution} />
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="section-link">
          <Link href="/news">
            Все новости <span aria-hidden="true">→</span>
          </Link>
        </p>
        <p className="section-link">
          <Link href="/dk">
            Все дома культуры района <span aria-hidden="true">→</span>
          </Link>
        </p>
      </section>

      {home?.contacts ? (
        <section className="contacts-section ornate-frame">
          <h2>Контакты</h2>
          <p style={{ whiteSpace: 'pre-line' }}>{home.contacts}</p>
        </section>
      ) : null}
    </>
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
