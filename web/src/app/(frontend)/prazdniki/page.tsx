import type { Metadata } from 'next'

import { canonicalOf } from '../../../lib/site'
import { FestivalsView } from '../_views/FestivalsView'

// Праздники района — карточки-ссылки на сайты праздников (D-075). Данные
// статические, страница может пререндериться.
export const metadata: Metadata = {
  title: 'Праздники района',
  description:
    'Большие праздники Малмыжского района — Сабантуй и ярмарка Казанская: ссылки на их сайты.',
  alternates: { canonical: canonicalOf('/prazdniki') },
  openGraph: { url: canonicalOf('/prazdniki'), title: 'Праздники района' },
}

export default function FestivalsPage() {
  return <FestivalsView />
}
