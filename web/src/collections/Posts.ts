import type { CollectionConfig } from 'payload'

import { adminOrEditor } from '../access/adminOrEditor'
import { authenticatedOrPublished } from '../access/authenticatedOrPublished'
import { populatePublishedAt } from '../hooks/populatePublishedAt'
import { revalidatePost, revalidatePostDelete } from '../hooks/revalidatePost'
import { slugField } from '../fields/slug'

// Новости и афиши портала. Лента /news, страница /news/[slug], последние — на
// главной, лента конкретного учреждения — на /dk/[slug].
export const Posts: CollectionConfig<'posts'> = {
  slug: 'posts',
  labels: {
    singular: 'Новость',
    plural: 'Новости',
  },
  access: {
    create: adminOrEditor,
    delete: adminOrEditor,
    read: authenticatedOrPublished,
    update: adminOrEditor,
  },
  admin: {
    defaultColumns: ['title', 'institution', 'type', 'date', 'updatedAt'],
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      label: 'Заголовок',
      required: true,
    },
    {
      name: 'institution',
      type: 'relationship',
      label: 'Дом культуры',
      relationTo: 'institutions',
      admin: {
        position: 'sidebar',
        description: 'Чей это материал. Пусто — общерайонная новость, без привязки к учреждению.',
      },
    },
    {
      // Афиша — не отдельная коллекция, а вид записи: структурно это тот же
      // материал с датой, и разведение по коллекциям удвоило бы маршруты, сид,
      // миграции и импорт из ВК, ничего не добавив редактору.
      name: 'type',
      type: 'select',
      label: 'Вид',
      required: true,
      defaultValue: 'news',
      options: [
        { label: 'Новость', value: 'news' },
        { label: 'Афиша', value: 'event' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'date',
      type: 'date',
      label: 'Дата новости',
      admin: {
        position: 'sidebar',
        description:
          'Дата в ленте. Для афиши — дата мероприятия: по ней отбираются ближайшие. ' +
          'Если пусто — берётся дата публикации.',
      },
    },
    {
      name: 'category',
      type: 'text',
      label: 'Рубрика',
      admin: {
        position: 'sidebar',
        description: 'Необязательная текстовая метка рубрики.',
      },
    },
    {
      name: 'cover',
      type: 'upload',
      label: 'Обложка',
      relationTo: 'media',
    },
    {
      name: 'content',
      type: 'richText',
      label: 'Текст новости',
    },
    {
      name: 'publishedAt',
      type: 'date',
      label: 'Дата публикации',
      admin: {
        position: 'sidebar',
      },
    },
    slugField(),
  ],
  hooks: {
    beforeChange: [populatePublishedAt],
    afterChange: [revalidatePost],
    afterDelete: [revalidatePostDelete],
  },
  versions: {
    drafts: true,
  },
}
