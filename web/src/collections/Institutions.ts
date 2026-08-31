import type { CollectionConfig } from 'payload'

import { adminOrEditor } from '../access/adminOrEditor'
import { authenticatedOrPublished } from '../access/authenticatedOrPublished'
import { revalidateInstitution, revalidateInstitutionDelete } from '../hooks/revalidateInstitution'
import { slugField } from '../fields/slug'

// Учреждения культуры района: РЦКД Малмыжа и сельские дома культуры. Каждое —
// свой раздел портала (/dk/[slug]); новости всех учреждений сходятся в общую
// ленту на главной.
//
// Черновики включены не для красоты: разделы заводятся постепенно, по мере того
// как находятся сообщества ВК и контакты, а портал при этом живой. Без чернового
// состояния наполовину заполненная карточка сразу висела бы в публичном списке.
export const Institutions: CollectionConfig<'institutions'> = {
  slug: 'institutions',
  labels: {
    singular: 'Дом культуры',
    plural: 'Дома культуры',
  },
  access: {
    create: adminOrEditor,
    delete: adminOrEditor,
    read: authenticatedOrPublished,
    update: adminOrEditor,
  },
  admin: {
    defaultColumns: ['title', 'settlement', 'isHead', 'updatedAt'],
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      label: 'Полное название',
      required: true,
      admin: {
        description: 'Как в документах: «Савальский сельский Дом культуры».',
      },
    },
    {
      name: 'shortTitle',
      type: 'text',
      label: 'Короткое название',
      admin: {
        description: 'Для бейджа в общей ленте: «Савали», «РЦКД». Пусто — берётся полное.',
      },
    },
    {
      name: 'settlement',
      type: 'text',
      label: 'Населённый пункт',
    },
    {
      name: 'description',
      type: 'textarea',
      label: 'Краткое описание',
      admin: {
        description: 'Одна-две фразы. Идёт в карточку в списке и в описание страницы.',
      },
    },
    {
      name: 'content',
      type: 'richText',
      label: 'Текст раздела',
    },
    {
      name: 'address',
      type: 'text',
      label: 'Адрес',
    },
    {
      name: 'phone',
      type: 'text',
      label: 'Телефон',
    },
    {
      name: 'vkGroupUrl',
      type: 'text',
      label: 'Сообщество ВКонтакте',
      admin: {
        position: 'sidebar',
        description:
          'Полная ссылка вида https://vk.com/example. Показывается на странице и ' +
          'служит источником импорта: пусто — записи из ВК не забираются.',
      },
    },
    {
      // owner_id в терминах VK API: у сообщества он ОТРИЦАТЕЛЬНЫЙ, у личной
      // страницы — положительный. Часть сельских ДК ведёт именно личные страницы,
      // и без знака запрос ушёл бы не на ту стену.
      //
      // Заполняет синхронизация сама, разбирая ссылку выше: редактору знать про
      // знак и про resolveScreenName не нужно, а рукописный id — источник тихих
      // ошибок (импорт молча тянет чужую стену).
      name: 'vkOwnerId',
      type: 'number',
      label: 'owner_id ВКонтакте',
      admin: {
        position: 'sidebar',
        readOnly: true,
        description:
          'Определяется автоматически по ссылке. Отрицательный — сообщество, ' +
          'положительный — личная страница.',
      },
    },
    {
      name: 'isHead',
      type: 'checkbox',
      label: 'Головное учреждение (РЦКД)',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        description: 'На раздел головного учреждения ведёт прежний домен домкультуры.вмалмыже.рф.',
      },
    },
    slugField(),
  ],
  hooks: {
    afterChange: [revalidateInstitution],
    afterDelete: [revalidateInstitutionDelete],
  },
  versions: {
    drafts: true,
  },
}
