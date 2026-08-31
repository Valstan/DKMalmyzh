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
      // Остальные фото записи. Отдельным полем, а не upload-узлами внутри
      // richText: рендер richText сложные узлы не отрисовывает вовсе, и картинки
      // молча исчезли бы со страницы. Заодно мимо граблей формата upload-узла в
      // Payload v3 (G230) — здесь обычная связь с media.
      name: 'gallery',
      type: 'array',
      label: 'Галерея',
      labels: { singular: 'Фото', plural: 'Фото' },
      fields: [
        {
          name: 'image',
          type: 'upload',
          relationTo: 'media',
          required: true,
        },
      ],
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
    {
      // Идентификатор записи в ВК в каноническом виде owner_post (именно так ВК
      // адресует записи). Уникальность на одном поле, а не составной индекс по
      // (учреждение, id записи): составной индекс пришлось бы дописывать в SQL
      // руками, и следующий migrate:create предложил бы его снести — то есть
      // ловушка для следующего, кто станет генерировать миграцию.
      name: 'vkUid',
      type: 'text',
      label: 'Запись ВКонтакте',
      unique: true,
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Служебное: owner_post. По нему синхронизация узнаёт уже импортированное.',
      },
    },
    {
      name: 'source',
      type: 'select',
      label: 'Источник',
      required: true,
      defaultValue: 'manual',
      options: [
        { label: 'Создано вручную', value: 'manual' },
        { label: 'Импорт из ВКонтакте', value: 'vk' },
      ],
      admin: {
        position: 'sidebar',
        readOnly: true,
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
