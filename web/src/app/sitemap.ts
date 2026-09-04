import type { MetadataRoute } from 'next'

import config from '@payload-config'
import { getPayload } from 'payload'

import { SITE_URL } from '../lib/site'

// /sitemap.xml — дома культуры (Institutions), страницы (Pages), новости (Posts)
// + статические маршруты.
//
// force-dynamic — строим в рантайме против реальной прод-БД, НЕ пререндерим в сборке
// (иначе в бандл запекается вырожденный sitemap против пустой build-БД).
export const dynamic = 'force-dynamic'

// Тот же SITE_URL, что у метаданных и robots. Раньше здесь был свой baseUrl с
// другим фолбэком: два источника правды про адрес сайта расходятся молча, и
// каноникалы с sitemap начинают указывать в разные места.
const baseUrl = SITE_URL

type Coll = 'institutions' | 'pages' | 'posts'
type Doc = { slug?: string | null; updatedAt?: string | null }

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${baseUrl}/news`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${baseUrl}/dk`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/prazdniki`, changeFrequency: 'monthly', priority: 0.6 },
  ]

  let payload: Awaited<ReturnType<typeof getPayload>>
  try {
    payload = await getPayload({ config })
  } catch (e) {
    console.error('[sitemap] getPayload failed:', e)
    return entries
  }

  const collect = async (collection: Coll, prefix: string) => {
    try {
      const res = await payload.find({
        collection,
        where: { _status: { equals: 'published' } },
        depth: 0,
        limit: 1000,
        pagination: false,
      })
      for (const doc of res.docs as Doc[]) {
        if (!doc.slug) continue
        entries.push({
          url: `${baseUrl}${prefix}/${encodeURIComponent(doc.slug)}`,
          lastModified: doc.updatedAt ? new Date(doc.updatedAt) : undefined,
          changeFrequency: 'weekly',
        })
      }
    } catch (e) {
      console.error(`[sitemap] ${collection} query failed:`, e)
    }
  }

  await collect('institutions', '/dk')
  await collect('pages', '/pages')
  await collect('posts', '/news')

  return entries
}
