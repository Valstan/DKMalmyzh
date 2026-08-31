import type { Metadata } from 'next'

import { InstitutionsView } from '../_views/InstitutionsView'

// Список домов культуры района. Тело — в _views/InstitutionsView.
export const revalidate = 60

export const metadata: Metadata = {
  title: 'Дома культуры района',
  description: 'Учреждения культуры Малмыжского района: разделы, контакты, новости и афиши.',
}

export default function InstitutionsPage() {
  return <InstitutionsView />
}
