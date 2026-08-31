import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

import type { Institution } from '../payload-types'
import { safeRevalidatePath } from '../lib/safeRevalidate'

// On-demand ISR для домов культуры: список /dk, раздел /dk/[slug] и главная
// (кнопка и ссылка на список ведут туда же, а карточки в ленте несут бейдж ДК —
// смена короткого названия видна на главной).
const revalidateInstitutionPaths = (payload: { logger: { info: (m: string) => void } }) => {
  payload.logger.info('[revalidate] institutions → /dk, /dk/[slug], /')
  safeRevalidatePath('/dk', 'page')
  safeRevalidatePath('/dk/[slug]', 'page')
  safeRevalidatePath('/', 'page')
}

export const revalidateInstitution: CollectionAfterChangeHook<Institution> = ({
  doc,
  req: { payload, context },
}) => {
  if (!context.disableRevalidate) revalidateInstitutionPaths(payload)
  return doc
}

export const revalidateInstitutionDelete: CollectionAfterDeleteHook<Institution> = ({
  doc,
  req: { payload, context },
}) => {
  if (!context.disableRevalidate) revalidateInstitutionPaths(payload)
  return doc
}
