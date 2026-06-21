// Единый источник правды о сайте — URL, название, описание. Используется в
// метаданных, robots, sitemap. Боевой URL бейкается из env при сборке; фолбэк —
// punycode-домен дкмалмыж.рф (кириллица в CI-bash бьётся — поэтому ASCII-форма).
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SERVER_URL || 'https://xn--80ahhogec4j.xn--p1ai'
).replace(/\/$/, '')

export const SITE_NAME = 'РЦКД г. Малмыж'

export const SITE_DESC = 'Малмыжский районный Центр культуры и досуга — официальный сайт. Новости и материалы.'
