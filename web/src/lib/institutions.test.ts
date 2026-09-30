import { describe, expect, it } from 'vitest'

import { institutionDomainName, institutionHref, institutionUrl } from './institutions'

// Личные домены учреждений: у кого свой адрес — ссылки ведут на него.
describe('institutionUrl', () => {
  it('без домена — раздел портала', () => {
    expect(institutionUrl({ id: 1, slug: 'rckd' })).toBe('/dk/rckd')
  })

  it('с доменом — личный адрес как есть', () => {
    expect(
      institutionUrl({ id: 1, slug: 'rckd', website: 'https://xn--d1amdcjpngc5fh.xn--80adkdyec4j.xn--p1ai/' }),
    ).toBe('https://xn--d1amdcjpngc5fh.xn--80adkdyec4j.xn--p1ai/')
  })

  it('мусор вместо ссылки — не ссылка, а раздел портала', () => {
    expect(institutionUrl({ id: 1, slug: 'rckd', website: 'не ссылка' })).toBe('/dk/rckd')
    expect(institutionUrl({ id: 1, slug: 'rckd', website: '   ' })).toBe('/dk/rckd')
  })
})

describe('institutionDomainName', () => {
  it('punycode показывает кириллицей', () => {
    expect(
      institutionDomainName({
        id: 1,
        slug: 'rckd',
        website: 'https://xn--d1amdcjpngc5fh.xn--80adkdyec4j.xn--p1ai/',
      }),
    ).toBe('домкультуры.вмалмыже.рф')
    expect(
      institutionDomainName({
        id: 2,
        slug: 'kalinino',
        website: 'https://xn----8sbksaibjtblz.xn--80adkdyec4j.xn--p1ai/',
      }),
    ).toBe('сдк-калинино.вмалмыже.рф')
  })

  it('без домена — пусто, подписи нет', () => {
    expect(institutionDomainName({ id: 1, slug: 'rckd' })).toBe('')
    expect(institutionDomainName({ id: 1, slug: 'rckd', website: 'мусор' })).toBe('')
  })
})

describe('institutionHref', () => {
  it('внутренний адрес раздела не меняется', () => {
    expect(institutionHref({ id: 1, slug: 'rckd' })).toBe('/dk/rckd')
  })
})
