// Единый источник правды о сайте — URL, название, описание. Используется в
// метаданных, robots, sitemap. Боевой URL бейкается из env при сборке; фолбэк —
// punycode-домен домкультуры.вмалмыже.рф (кириллица в CI-bash бьётся — поэтому
// ASCII-форма). Прежний дкмалмыж.рф выведен из обращения (регистрация истекла).
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SERVER_URL || 'https://xn--d1amdcjpngc5fh.xn--80adkdyec4j.xn--p1ai'
).replace(/\/$/, '')

export const SITE_NAME = 'РЦКД г. Малмыж'

export const SITE_DESC = 'Малмыжский районный Центр культуры и досуга — официальный сайт. Новости и материалы.'
