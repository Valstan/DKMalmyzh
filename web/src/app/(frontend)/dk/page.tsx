import type { Metadata } from 'next'

import { canonicalOf, openGraphWithImage } from '../../../lib/site'
import { InstitutionsView } from '../_views/InstitutionsView'

// Список домов культуры района. Тело — в _views/InstitutionsView.
export const revalidate = 60

export const metadata: Metadata = {
  // Тот же заголовок, что и h1 на странице. Расхождение выглядит мелочью, пока
  // раздел назовут «дома культуры»; как только в списке появятся ДШИ и музей
  // (а правило их уже учитывает), «Дома культуры района» станет просто неверным.
  title: 'Дома культуры и учреждения района',
  description:
    'Учреждения культуры Малмыжского района: дома культуры, школа искусств, музей — разделы, контакты, новости и афиши. Поиск по названию.',
  alternates: { canonical: canonicalOf('/dk') },
  openGraph: openGraphWithImage({ path: '/dk', title: 'Дома культуры и учреждения района' }),
}

export default function InstitutionsPage() {
  return <InstitutionsView />
}
