import type { Metadata } from 'next'

import { canonicalOf } from '../../../lib/site'
import { InstitutionsView } from '../_views/InstitutionsView'

// Список домов культуры района. Тело — в _views/InstitutionsView.
export const revalidate = 60

export const metadata: Metadata = {
  title: 'Дома культуры района',
  description: 'Учреждения культуры Малмыжского района: разделы, контакты, новости и афиши.',
  alternates: { canonical: canonicalOf('/dk') },
  openGraph: { url: canonicalOf('/dk'), title: 'Дома культуры района' },
}

export default function InstitutionsPage() {
  return <InstitutionsView />
}
