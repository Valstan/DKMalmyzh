import type { Metadata } from 'next'

import { canonicalOf } from '../../lib/site'
import { HomeView } from './_views/HomeView'

// Главная. Тело — _views/HomeView (тексты главной + последние новости). ISR.
export const revalidate = 60

// Канонический адрес задаёт каждая страница сама: в корневом layout он
// проставлялся бы всем сразу (см. комментарий там).
export const metadata: Metadata = {
  alternates: { canonical: canonicalOf('/') },
  openGraph: { url: canonicalOf('/') },
}

export default function HomePage() {
  return <HomeView />
}
