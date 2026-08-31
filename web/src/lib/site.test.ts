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
})
