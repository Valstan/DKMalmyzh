import config from '@payload-config'
import { getPayload } from 'payload'

import { withRetry } from '../../../lib/withRetry'
import { institutionDomainName } from '../../../lib/institutionsDomain'
import { toDirectoryRows, type DirectoryItem } from '../../../lib/institutions/directory'
import { InstitutionDirectory } from '../_views/InstitutionDirectory'

// Список учреждений района. Головное — первым, дальше по алфавиту: районный ДК
// логично видеть в начале, а сельские искать по названию.
//
// Подпись, картинку и читаемое имя домена считаем ЗДЕСЬ и отдаём компоненту
// готовыми строками: имя домена требует `node:url`, а он не собирается в
// браузерный бандл. Правило «для дома культуры показываем село, для школы — полное
// название» тоже живёт на сервере — тогда оно не зависит от того, какие поля
// долетели до браузера.
async function getInstitutions(): Promise<DirectoryItem[]> {
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
      return res.docs as DirectoryItem[]
    })
  } catch {
    return []
  }
}

export async function InstitutionsView() {
  const institutions = await getInstitutions()
  const rows = toDirectoryRows(institutions, institutionDomainName)

  return (
    <section>
      <h1>Дома культуры и учреждения района</h1>
      <p className="muted">
        Начните вводить название — список отфильтруется по совпадению в любом месте названия.
        Головое учреждение — Малмыжский районный Центр культуры и досуга.
      </p>
      <InstitutionDirectory rows={rows} />
    </section>
  )
}