import { describe, expect, it } from 'vitest'

import { adminOnly } from './adminOnly'
import { adminOrEditor } from './adminOrEditor'
import { adminOrSelf } from './adminOrSelf'
import { anyone } from './anyone'
import { authenticatedOrPublished } from './authenticatedOrPublished'

// Серверный authz — единственная настоящая защита: клиентский edit-гейт обходится
// прямым запросом в REST. Поэтому проверяем именно отказы, а не только разрешения.
type Args = Parameters<typeof adminOnly>[0]

const as = (user: unknown): Args => ({ req: { user } }) as unknown as Args
const guest = as(null)
const admin = as({ id: 1, roles: ['admin'] })
const editor = as({ id: 2, roles: ['editor'] })
const roleless = as({ id: 3, roles: [] })
const broken = as({ id: 4, roles: 'admin' })

describe('adminOnly', () => {
  it('пускает админа', () => {
    expect(adminOnly(admin)).toBe(true)
  })

  it('не пускает редактора, безролевого и гостя', () => {
    expect(adminOnly(editor)).toBe(false)
    expect(adminOnly(roleless)).toBe(false)
    expect(adminOnly(guest)).toBe(false)
  })

  // roles строкой вместо массива: 'admin'.includes('admin') дало бы true, если бы
  // проверки на Array.isArray не было.
  it('не пускает по роли-строке', () => {
    expect(adminOnly(broken)).toBe(false)
  })
})

describe('adminOrEditor', () => {
  it('пускает персонал', () => {
    expect(adminOrEditor(admin)).toBe(true)
    expect(adminOrEditor(editor)).toBe(true)
  })

  it('не пускает залогиненного без роли — «authenticated» ещё не «персонал»', () => {
    expect(adminOrEditor(roleless)).toBe(false)
    expect(adminOrEditor(broken)).toBe(false)
    expect(adminOrEditor(guest)).toBe(false)
  })
})

describe('adminOrSelf', () => {
  it('админу — всё', () => {
    expect(adminOrSelf(admin)).toBe(true)
  })

  it('обычному — фильтр по своей записи', () => {
    expect(adminOrSelf(editor)).toEqual({ id: { equals: 2 } })
  })

  it('гостю — отказ', () => {
    expect(adminOrSelf(guest)).toBe(false)
  })
})

describe('authenticatedOrPublished', () => {
  it('персоналу видны черновики', () => {
    expect(authenticatedOrPublished(admin)).toBe(true)
    expect(authenticatedOrPublished(editor)).toBe(true)
  })

  it('гостю — только опубликованное', () => {
    expect(authenticatedOrPublished(guest)).toEqual({ _status: { equals: 'published' } })
  })
})

describe('anyone', () => {
  it('открыт всем — используется только на чтение', () => {
    expect(anyone(guest)).toBe(true)
  })
})
