import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// SITE_URL вычисляется на импорте модуля, поэтому каждый случай — свежий импорт
// после resetModules; иначе первый прочитанный env залипнет на весь файл.
const ENV_KEY = 'NEXT_PUBLIC_SERVER_URL'

// environment.d.ts объявляет ключ обязательным (в бою он и правда всегда задан),
// поэтому для случая «переменной нет» нужен вид на process.env без этой гарантии.
const env: Record<string, string | undefined> = process.env

async function loadSite(url?: string) {
  vi.resetModules()
  if (url === undefined) delete env[ENV_KEY]
  else env[ENV_KEY] = url
  return import('./site')
}

describe('site', () => {
  let saved: string | undefined

  beforeEach(() => {
    saved = env[ENV_KEY]
  })

  afterEach(() => {
    if (saved === undefined) delete env[ENV_KEY]
    else env[ENV_KEY] = saved
  })

  it('берёт URL из env', async () => {
    const { SITE_URL } = await loadSite('https://example.test')
    expect(SITE_URL).toBe('https://example.test')
  })

  it('срезает хвостовой слэш — иначе каноникалы и sitemap дают двойной //', async () => {
    const { SITE_URL } = await loadSite('https://example.test/')
    expect(SITE_URL).toBe('https://example.test')
  })

  it('без env падает на боевой фолбэк по https', async () => {
    const { SITE_URL } = await loadSite()
    expect(SITE_URL.startsWith('https://')).toBe(true)
    expect(SITE_URL.endsWith('/')).toBe(false)
  })

  // Домен у нас IDN, и фолбэк обязан быть в punycode: кириллица в этой строке
  // бьётся в bash-шагах CI и в curl со сборочного раннера (locale C).
  it('фолбэк — ASCII-punycode, без кириллицы', async () => {
    const { SITE_URL } = await loadSite()
    expect(SITE_URL).toMatch(/^[\x20-\x7e]+$/)
  })

  it('название и описание непустые — идут в метаданные каждой страницы', async () => {
    const { SITE_NAME, SITE_DESC } = await loadSite()
    expect(SITE_NAME.trim().length).toBeGreaterThan(0)
    expect(SITE_DESC.trim().length).toBeGreaterThan(0)
  })

  // Обложка ссылки. Проверяем именно пару «canonical + картинка»: до приёмки
  // #123 вызов забрасывали только в layout, и до страниц со своим openGraph он
  // не доезжал — og:image остался лишь у новостей.
  describe('openGraphWithImage', () => {
    it('без своего кадра даёт общую обложку портала', async () => {
      const { openGraphWithImage } = await loadSite('https://example.test')
      expect(openGraphWithImage({ path: '/dk' }).images).toEqual(['https://example.test/og.png'])
    })

    it('со своим кадром общая не подставляется', async () => {
      const { openGraphWithImage } = await loadSite('https://example.test')
      const og = openGraphWithImage({ path: '/news/x', images: ['https://example.test/a.jpg'] })
      expect(og.images).toEqual(['https://example.test/a.jpg'])
    })

    it('url собирается из пути тем же кодированием, что canonical', async () => {
      const { canonicalOf, openGraphWithImage } = await loadSite('https://example.test')
      const og = openGraphWithImage({ path: '/dk/рожки' })
      expect(og.url).toBe(canonicalOf('/dk/рожки'))
      expect(og.url).not.toContain('рожки')
    })

    it('описание и заголовок попадают только когда заданы', async () => {
      const { openGraphWithImage } = await loadSite('https://example.test')
      const bare = openGraphWithImage({ path: '/' })
      expect(bare).not.toHaveProperty('title')
      expect(bare).not.toHaveProperty('description')
      const full = openGraphWithImage({ path: '/', title: 'Т', description: 'О' })
      expect(full.title).toBe('Т')
      expect(full.description).toBe('О')
    })
  })
})
