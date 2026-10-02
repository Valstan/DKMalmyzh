import type { Metadata } from 'next'

import { canonicalOf, openGraphWithImage } from '../../lib/site'
import { HomeView } from './_views/HomeView'

// Главная. Тело — _views/HomeView (тексты главной + последние новости). ISR.
export const revalidate = 60

// Канонический адрес и обложку задаёт каждая страница сама: в корневом layout
// они проставлялись бы всем сразу либо, наоборот, не доезжали до страниц со
// своим openGraph (см. комментарии в layout.tsx и lib/site.ts).
export const metadata: Metadata = {
  alternates: { canonical: canonicalOf('/') },
  openGraph: openGraphWithImage({ path: '/' }),
}

export default function HomePage() {
  return <HomeView />
}
