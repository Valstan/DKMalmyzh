import path from 'path'
import { fileURLToPath } from 'url'

import { withPayload } from '@payloadcms/next/withPayload'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const NEXT_PUBLIC_SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL || process.env.__NEXT_PRIVATE_ORIGIN || 'http://localhost:3005'

// Оба боевых домена: next/image отдаёт удалённую картинку только с разрешённого
// хоста, а прежний домен на переходный период ещё обслуживает страницы.
const IMAGE_HOSTS = [
  ...new Set([
    NEXT_PUBLIC_SERVER_URL,
    'https://xn--80atdujec4e.xn--80adkdyec4j.xn--p1ai',
    'https://xn--d1amdcjpngc5fh.xn--80adkdyec4j.xn--p1ai',
  ]),
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Прод-VPS (мало RAM) не тянет `next build` (OOM). Сборка едет в CI
  // (GitHub Actions, ubuntu), на сервер кладём готовый standalone-сервер.
  // tracingRoot = web/ — чтобы server.js лёг в корень .next/standalone.
  //
  // ⚠️ standalone-сборка делает outputFileTracing, который МУТИРУЕТ локальный
  // node_modules. Поэтому standalone включаем ТОЛЬКО по флагу STANDALONE_BUILD=1
  // (его ставит deploy-prod.yml). Локальный `next build` — обычный, node_modules
  // не портит → можно собирать повторно без реинстолла.
  output: process.env.STANDALONE_BUILD === '1' ? 'standalone' : undefined,
  outputFileTracingRoot: __dirname,
  images: {
    remotePatterns: [
      ...IMAGE_HOSTS.map((item) => {
        const url = new URL(item)
        return {
          hostname: url.hostname,
          protocol: url.protocol.replace(':', ''),
        }
      }),
    ],
  },
  reactStrictMode: true,
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
