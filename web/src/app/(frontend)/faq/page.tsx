import type { Metadata } from 'next'

import { canonicalOf, openGraphWithImage } from '../../../lib/site'
import { FAQView } from '../_views/FAQView'

// FAQ — часто задаваемые вопросы о культуре Малмыжского района.
export const metadata: Metadata = {
  title: 'Часто задаваемые вопросы',
  description:
    'Ответы на вопросы о домах культуры, ДШИ, музее, праздниках Сабантуй и Казанская ярмарка, кружках и мероприятиях Малмыжского района.',
  alternates: { canonical: canonicalOf('/faq') },
  openGraph: openGraphWithImage({ path: '/faq', title: 'FAQ — Часто задаваемые вопросы' }),
}

export default function FAQPage() {
  return <FAQView />
}