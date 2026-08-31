import type { Metadata } from 'next'

import { InstitutionView, institutionMeta } from '../../_views/InstitutionView'

// Раздел дома культуры (Institutions по slug). Тело — в _views/InstitutionView.
export const revalidate = 60

type Args = { params: Promise<{ slug: string }> }

export default async function InstitutionBySlug({ params }: Args) {
  const { slug } = await params
  return <InstitutionView slug={slug} />
}

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const { slug } = await params
  return institutionMeta(slug)
}
