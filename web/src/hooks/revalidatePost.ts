import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

import type { Post } from '../payload-types'
import { safeRevalidatePath } from '../lib/safeRevalidate'

// On-demand ISR для новостей: лента /news, страница /news/[slug], главная
// (последние новости и ближайшие афиши) и раздел дома культуры — новость
// принадлежит учреждению и показывается в его ленте.
const revalidatePostPaths = (payload: { logger: { info: (m: string) => void } }) => {
  payload.logger.info('[revalidate] posts → /news, /news/[slug], /dk/[slug], /')
  safeRevalidatePath('/news', 'page')
  safeRevalidatePath('/news/[slug]', 'page')
  safeRevalidatePath('/dk/[slug]', 'page')
  safeRevalidatePath('/', 'page')
}

export const revalidatePost: CollectionAfterChangeHook<Post> = ({
  doc,
  req: { payload, context },
}) => {
  if (!context.disableRevalidate) revalidatePostPaths(payload)
  return doc
}

export const revalidatePostDelete: CollectionAfterDeleteHook<Post> = ({
  doc,
  req: { payload, context },
}) => {
  if (!context.disableRevalidate) revalidatePostPaths(payload)
  return doc
}
