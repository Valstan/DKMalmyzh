// Генератор OG-обложки (1200×630) для превью ссылок в мессенджерах и соцсетях.
//
// Почему скриптом, а не картинкой в репозитории: обложка обязана переживать
// смену названия/эмблемы, а руками её перерисовывать забудут. Здесь источник
// один — текущая эмблема портала (`src/app/icon.png`), та же, что в шапке.
//
// Запуск: node scripts/make-og.mjs (из каталога web/).
// Результат: public/og.png — кладётся в git, статикой отдаётся самим Next.
//
// Размер 1200×630 — стандарт Open Graph: меньше 1200 по ширине мессенджеры
// показывают мелкой иконкой, а не большой карточкой.

import path from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const here = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.resolve(here, '..')

const WIDTH = 1200
const HEIGHT = 630

const emblem = await sharp(path.join(webRoot, 'src/app/icon.png'))
  .resize(300, 300, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .toBuffer()

// Фон — тёмно-бордовый в тон шапке сайта, эмблема по центру.
// Текста на обложке НЕ рисуем: шрифты на раннере и на боксе разные, и
// подпись, собранная sharp'ом, разъехалась бы между средами. Заголовок и
// описание мессенджер берёт из og:title/og:description — их и достаточно.
const svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#5b1f24"/>
  <rect x="40" y="40" width="${WIDTH - 80}" height="${HEIGHT - 80}" fill="none" stroke="#e8d9b5" stroke-width="4" opacity="0.55"/>
</svg>`

const out = path.join(webRoot, 'public/og.png')
await sharp(Buffer.from(svg))
  .composite([{ input: emblem, gravity: 'center' }])
  .png({ compressionLevel: 9 })
  .toFile(out)

const meta = await sharp(out).metadata()
console.log(`og.png готов: ${meta.width}x${meta.height}`)
