import { describe, expect, it } from 'vitest'

import { articleJsonLd, eventJsonLd, institutionJsonLd, organizationJsonLd, toJsonLdScript } from './jsonLd'
import { SITE_URL } from './site'

describe('toJsonLdScript', () => {
  it('экранирует угловые скобки — иначе </script> закроет тег изнутри', () => {
    const out = toJsonLdScript({ t: 'конец </script><b>вот тут</b>' })
    expect(out).not.toContain('</script>')
    expect(out).not.toContain('<b>')
    expect(out).toContain('\\u003c')
  })

  it('результат остаётся валидным JSON', () => {
    const original = { a: 1, b: 'тире — и «кавычки»', c: null }
    expect(JSON.parse(toJsonLdScript(original))).toEqual(original)
  })

  it('без спецсимволов ничего не портит', () => {
    const out = toJsonLdScript({ name: 'Культура Малмыжского района' })
    expect(JSON.parse(out).name).toBe('Культура Малмыжского района')
  })
})

describe('organizationJsonLd', () => {
  it('имя, адрес сайта и логотип — канонический', () => {
    const ld = organizationJsonLd()
    expect(ld['@type']).toBe('Organization')
    expect(ld.name).toContain('Малмыж')
    // Логотип — абсолютный адрес из SITE_URL. Схему НЕ проверяем: в CI
    // NEXT_PUBLIC_SERVER_URL=http://127.0.0.1:3005, и требование https делало
    // бы тест зависимым от окружения, а не от кода (поймано красным гейтом).
    expect(ld.logo).toBe(`${SITE_URL}/icon.png`)
  })
})

describe('articleJsonLd', () => {
  const base = { slug: 'концерт-в-клубе-123', title: 'Концерт в клубе', date: '2026-09-29T10:00:00.000Z' }

  it('размечает новость как NewsArticle с датой и языком', () => {
    const ld = articleJsonLd(base)
    expect(ld['@type']).toBe('NewsArticle')
    expect(ld.headline).toBe('Концерт в клубе')
    expect(ld.datePublished).toBe('2026-09-29T10:00:00.000Z')
    expect(ld.inLanguage).toBe('ru-RU')
  })

  it('canonical кодирует кириллический slug (G300) — иначе адрес невалиден в JSON', () => {
    const ld = articleJsonLd(base)
    expect(ld.url).not.toContain('концерт')
    expect(decodeURIComponent(ld.url)).toContain('концерт-в-клубе-123')
  })

  it('дата публикации приоритетнее даты оригинала', () => {
    const ld = articleJsonLd({ ...base, publishedAt: '2026-09-30T00:00:00.000Z' })
    expect(ld.datePublished).toBe('2026-09-30T00:00:00.000Z')
  })

  it('дом культуры становится автором, безымянного автора нет', () => {
    expect(articleJsonLd({ ...base, institutionTitle: 'РЦКД Малмыж' }).author).toEqual({
      '@type': 'Organization',
      name: 'РЦКД Малмыж',
    })
    expect(articleJsonLd(base)).not.toHaveProperty('author')
  })

  it('без изображения поле не появляется (а не остаётся пустым)', () => {
    expect(articleJsonLd(base)).not.toHaveProperty('image')
    expect(articleJsonLd({ ...base, imageUrl: 'https://x.test/a.jpg' }).image).toEqual(['https://x.test/a.jpg'])
  })

  it('издатель — организация портала', () => {
    expect(articleJsonLd(base).publisher['@type']).toBe('Organization')
  })
})

describe('eventJsonLd', () => {
  it('размечает афишу как Event с датой начала', () => {
    const ld = eventJsonLd({ slug: 'afisha-1', title: 'Афиша от 2026-09-29', date: '2026-09-29T00:00:00.000Z' })
    expect(ld['@type']).toBe('Event')
    expect(ld.startDate).toBe('2026-09-29T00:00:00.000Z')
    expect(ld.eventStatus).toContain('EventScheduled')
  })
})

describe('institutionJsonLd', () => {
  it('размечает дом культуры с адресом и телефоном', () => {
    const ld = institutionJsonLd({
      slug: 'rckd',
      title: 'РЦКД Малмыж',
      address: 'г. Малмыж, ул. Ленина, 1',
      phone: '+7 (83347) 2-15-36',
    })
    expect(ld['@type']).toBe('Organization')
    expect(ld.telephone).toContain('2-15-36')
    expect(ld.address?.['@type']).toBe('PostalAddress')
    expect(ld.parentOrganization.name).toContain('Малмыж')
  })

  it('без адреса и телефона поля не появляются', () => {
    const ld = institutionJsonLd({ slug: 'x', title: 'ДК' })
    expect(ld).not.toHaveProperty('address')
    expect(ld).not.toHaveProperty('telephone')
  })
})
