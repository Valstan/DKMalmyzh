import { describe, expect, it, vi } from 'vitest'

import { slugForVkPost } from './import'
import { reslugVkPosts } from './reslug'

// Операция трогает 636 живых документов на проде, поэтому проверяется не «что-то
// обновилось», а конкретные свойства: разводит дубли, идемпотентна, не наезжает
// на занятый адрес и сохраняет черновик черновиком.

type Doc = {
  id: number
  title: string
  slug: string
  vkUid?: string
  date: string
  source?: string
  _status?: string
}

const makePayload = (docs: Doc[]) => {
  const updates: { id: number; slug: string; draft: boolean }[] = []
  const payload = {
    find: vi.fn(async ({ where }: { where?: { source?: { equals: string } } }) => {
      const rows = where?.source ? docs.filter((d) => d.source === 'vk') : docs
      return { docs: rows, totalDocs: rows.length }
    }),
    update: vi.fn(async ({ id, data, draft }: { id: number; data: { slug: string }; draft: boolean }) => {
      const doc = docs.find((d) => d.id === id)
      if (doc) doc.slug = data.slug
      updates.push({ id, slug: data.slug, draft })
      return doc
    }),
  }
  return { payload, updates }
}

const doc = (id: number, title: string, slug: string, vkUid: string, status = 'draft'): Doc => ({
  id,
  title,
  slug,
  vkUid,
  date: '2026-09-01T00:00:00.000Z',
  source: 'vk',
  _status: status,
})

describe('переименование адресов записей из ВК', () => {
  it('разводит две записи с одинаковым адресом', async () => {
    const docs = [
      doc(1, 'Концерт ко Дню села', 'kontsert-ko-dnyu-sela', '-100_11'),
      doc(2, 'Концерт ко Дню села', 'kontsert-ko-dnyu-sela', '-100_12'),
    ]
    const { payload } = makePayload(docs)

    const summary = await reslugVkPosts(payload as never)

    expect(summary.renamed).toBe(2)
    expect(docs[0].slug).not.toBe(docs[1].slug)
    expect(new Set(docs.map((d) => d.slug)).size).toBe(2)
  })

  it('идемпотентна: повторный прогон ничего не меняет', async () => {
    const docs = [
      doc(1, 'Концерт', slugForVkPost('Концерт', '-100_11', '2026-09-01T00:00:00.000Z'), '-100_11'),
    ]
    const { payload, updates } = makePayload(docs)

    const summary = await reslugVkPosts(payload as never)

    expect(summary.renamed).toBe(0)
    expect(summary.skipped).toBe(1)
    expect(updates).toHaveLength(0)
  })

  it('dry-run ничего не пишет, но считает', async () => {
    const docs = [doc(1, 'Афиша', 'afisha', '-100_11'), doc(2, 'Афиша', 'afisha', '-100_12')]
    const { payload, updates } = makePayload(docs)

    const summary = await reslugVkPosts(payload as never, { dryRun: true })

    expect(summary.renamed).toBe(2)
    expect(updates).toHaveLength(0)
    expect(docs[0].slug).toBe('afisha')
  })

  it('не наезжает на адрес, занятый чужой записью', async () => {
    const wanted = slugForVkPost('Ярмарка', '-100_11', '2026-09-01T00:00:00.000Z')
    const docs: Doc[] = [
      doc(1, 'Ярмарка', 'staryy-adres', '-100_11'),
      { id: 2, title: 'Ручная запись', slug: wanted, date: '2026-09-01T00:00:00.000Z', source: 'manual', _status: 'published' },
    ]
    const { payload, updates } = makePayload(docs)

    const summary = await reslugVkPosts(payload as never)

    expect(summary.failed).toBe(1)
    expect(summary.renamed).toBe(0)
    expect(updates).toHaveLength(0)
    expect(docs[0].slug).toBe('staryy-adres')
  })

  it('черновик обновляется как черновик, опубликованное — как опубликованное', async () => {
    const docs = [doc(1, 'Новость', 'novost', '-100_11', 'draft'), doc(2, 'Новость', 'novost', '-100_12', 'published')]
    const { payload, updates } = makePayload(docs)

    await reslugVkPosts(payload as never)

    expect(updates.find((u) => u.id === 1)?.draft).toBe(true)
    expect(updates.find((u) => u.id === 2)?.draft).toBe(false)
  })

  it('записи без vkUid не трогает', async () => {
    const docs: Doc[] = [
      { id: 1, title: 'Своя новость', slug: 'svoya', date: '2026-09-01T00:00:00.000Z', source: 'vk' },
    ]
    const { payload, updates } = makePayload(docs)

    const summary = await reslugVkPosts(payload as never)

    expect(summary.skipped).toBe(1)
    expect(updates).toHaveLength(0)
  })
})
