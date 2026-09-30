import config from '@payload-config'
import { getPayload } from 'payload'

import { withRetry } from '../../../lib/withRetry'
import { PostCards, type PostCardDoc } from '../components/PostCard'

// Общая лента «Афиша и новости» — карточками с превью, как на главной и в
// разделах домов культуры (заказ владельца 30.09).
//
// depth: 1 — карточкам нужна обложка объектом с `sizes`; при `depth: 0` приходит
// только идентификатором, и превью рисовать нечего. Тот же уровень нужен для
// бейджа дома культуры, который в общей ленте осмыслен (материалы разных ДК
// вперемешку).
//
// Рубрика в мета сохранена: в общей ленте это единственное, чем записи разных
// домов различаются, кроме бейджа. Уровень заголовка карточки — `h2`: список
// идёт сразу под `h1` страницы, пропускать уровень нельзя.
async function getPosts(): Promise<PostCardDoc[]> {
  try {
    return await withRetry(async () => {
      const payload = await getPayload({ config })
      const res = await payload.find({
        collection: 'posts',
        where: { _status: { equals: 'published' } },
        sort: '-date',
        depth: 1,
        limit: 100,
      })
      return res.docs as PostCardDoc[]
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
        <PostCards posts={posts} showCategory headingLevel="h2" />
      )}
    </section>
  )
}
