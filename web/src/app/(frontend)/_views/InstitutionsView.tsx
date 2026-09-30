import Link from 'next/link'
import config from '@payload-config'
import { getPayload } from 'payload'

import { withRetry } from '../../../lib/withRetry'
import { institutionUrl } from '../../../lib/institutions'
import { institutionDomainName } from '../../../lib/institutionsDomain'

type InstitutionListItem = {
  id: string | number
  title?: string | null
  shortTitle?: string | null
  settlement?: string | null
  description?: string | null
  slug?: string | null
  isHead?: boolean | null
  website?: string | null
}

// Список учреждений района. Головное — первым, дальше по алфавиту: районный ДК
// логично видеть в начале, а сельские искать по названию.
async function getInstitutions(): Promise<InstitutionListItem[]> {
  try {
    return await withRetry(async () => {
      const payload = await getPayload({ config })
      const res = await payload.find({
        collection: 'institutions',
        where: { _status: { equals: 'published' } },
        sort: ['-isHead', 'title'],
        depth: 0,
        limit: 200,
      })
      return res.docs as InstitutionListItem[]
    })
  } catch {
    return []
  }
}

export async function InstitutionsView() {
  const institutions = await getInstitutions()

  return (
    <section>
      <h1>Дома культуры района</h1>
      {institutions.length === 0 ? (
        <p className="muted">Разделы учреждений скоро появятся.</p>
      ) : (
        <ul className="post-list">
          {institutions.map((institution) => {
            // У кого есть личный домен — карточка ведёт на него, у остальных —
            // на раздел портала. Внешняя ссылка — обычным <a>: роутер Next
            // перехватывает только внутренние переходы.
            const url = institutionUrl(institution)
            const external = /^https?:\/\//i.test(url)
            const domain = institutionDomainName(institution)
            return (
              <li key={institution.id} className="post-list__item">
                <h2>
                  {external ? (
                    <a href={url}>{institution.title || 'Без названия'}</a>
                  ) : (
                    <Link href={url}>{institution.title || 'Без названия'}</Link>
                  )}
                </h2>
                <p className="post-list__meta">
                  {institution.settlement || ''}
                  {institution.isHead ? ' · головное учреждение' : ''}
                  {domain ? ` · ${domain}` : ''}
                </p>
                {institution.description ? <p>{institution.description}</p> : null}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
