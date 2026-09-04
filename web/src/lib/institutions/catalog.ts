// Справочник учреждений культуры Малмыжского района: населённый пункт, название,
// сообщество ВКонтакте.
//
// Собран 2026-08-31 из открытых источников: реестр КДУ Кировского областного дома
// народного творчества (единственный найденный полный перечень района — 29
// учреждений), карточки culture.ru, госвеб-сайты округа и поселений, поиск.
// Каждая ссылка проверена обращением к странице ВК: подтверждены имя, screen_name
// и owner_id. Данные не выдуманы и не восстановлены по памяти.
//
// Отсюда сеется черновой каталог (src/lib/institutions/seed.ts — вызывается и
// служебным маршрутом на проде, и скриптом локально). Черновики, а не
// публикации: перечень собран машиной по открытым источникам, и прежде чем
// показывать его району, владелец должен пройти карточки глазами.
//
// vkSources — всё, что нужно импорту: owner_id он определит сам, в том числе
// знак (у сообщества отрицательный, у личной страницы положительный).
//
// Источников у учреждения бывает несколько, и это не редкость: РЦКД печатает
// новости и в группе, и на личной странице (переучить не вышло), а у пяти
// сельских ДК рядом с действующей страницей живёт прежняя с архивом. Решение
// владельца 01.09 — забирать всё, лишнее отрезать потом.

export type InstitutionSeed = {
  title: string
  shortTitle: string
  settlement: string
  slug: string
  /** Ссылки на сообщества и страницы ВК. Порядок значения не имеет. */
  vkSources?: string[]
  isHead?: boolean
  /** Визуальный образ раздела (см. поле `theme` коллекции). */
  theme?: 'kalinino'
  /** Заметка для владельца: что проверить руками. Идёт в описание карточки. */
  note?: string
}

export const INSTITUTIONS: InstitutionSeed[] = [
  {
    title: 'Малмыжский районный Центр культуры и досуга',
    shortTitle: 'РЦКД Малмыж',
    settlement: 'г. Малмыж',
    slug: 'rckd',
    vkSources: ['https://vk.com/dk_malmyzh', 'https://vk.com/id234960216'],
    isHead: true,
  },
  {
    title: 'Дом культуры села Калинино',
    shortTitle: 'Калинино',
    settlement: 'с. Калинино',
    slug: 'kalinino',
    vkSources: ['https://vk.com/kalinino_sdk'],
    // Раздел унаследовал образ прежнего сайта Калининской ЦКС (D-074).
    theme: 'kalinino',
    note: 'Прежнее название — Калининская ЦКС, отдельным юрлицом быть перестала (филиал РЦКД). Уточнить официальное наименование. Через эту страницу идут также события Дерюшева и Нослов.',
  },
  {
    title: 'Аджимский сельский Дом культуры',
    shortTitle: 'Аджим',
    settlement: 'с. Аджим',
    slug: 'adzhim',
    vkSources: ['https://vk.com/id420841463', 'https://vk.com/club163930990'],
    note: 'Основное — личная страница; группа без активности примерно с 2018, взята ради архива.',
  },
  {
    title: 'Арыкский сельский Дом культуры',
    shortTitle: 'Арык',
    settlement: 'д. Арык',
    slug: 'aryk',
    vkSources: ['https://vk.com/club157904213'],
  },
  {
    title: 'Большекитякский сельский Дом культуры',
    shortTitle: 'Большой Китяк',
    settlement: 'с. Большой Китяк',
    slug: 'bolshoy-kityak',
    vkSources: ['https://vk.com/club140412672'],
  },
  {
    title: 'Большешабанский сельский клуб',
    shortTitle: 'Большая Шабанка',
    settlement: 'д. Большая Шабанка',
    slug: 'bolshaya-shabanka',
    vkSources: ['https://vk.com/public197439468'],
  },
  {
    title: 'Большесатнурский сельский клуб',
    shortTitle: 'Большой Сатнур',
    settlement: 'д. Большой Сатнур',
    slug: 'bolshoy-satnur',
    vkSources: ['https://vk.com/club228720015'],
  },
  {
    title: 'Верхнедеревенский сельский клуб',
    shortTitle: 'Верхняя',
    settlement: 'д. Верхняя',
    slug: 'verhnyaya',
    vkSources: ['https://vk.com/verhnyayaderevnya92922358'],
  },
  {
    title: 'Гоньбинский сельский клуб',
    shortTitle: 'Гоньба',
    settlement: 'с. Гоньба',
    slug: 'gonba',
    vkSources: ['https://vk.com/club218487274'],
  },
  {
    title: 'Каксинвайский сельский Дом культуры',
    shortTitle: 'Каксинвай',
    settlement: 'с. Каксинвай',
    slug: 'kaksinvay',
    vkSources: ['https://vk.com/club224505263', 'https://vk.com/public218593948'],
  },
  {
    title: 'Кинерский сельский клуб',
    shortTitle: 'Кинерь',
    settlement: 'д. Кинерь',
    slug: 'kiner',
    vkSources: ['https://vk.com/club182892169'],
    note: 'В областном реестре учреждений клуба нет, но сообщество живое — взято по решению владельца 01.09.',
  },
  {
    title: 'Константиновский сельский Дом культуры',
    shortTitle: 'Константиновка',
    settlement: 'с. Константиновка',
    slug: 'konstantinovka',
    vkSources: ['https://vk.com/club207374391', 'https://vk.com/club158250137'],
  },
  {
    title: 'Мари-Малмыжский сельский Дом культуры',
    shortTitle: 'Мари-Малмыж',
    settlement: 'с. Мари-Малмыж',
    slug: 'mari-malmyzh',
    vkSources: ['https://vk.com/club211149420', 'https://vk.com/club199379135'],
  },
  {
    title: 'Мелетский сельский клуб',
    shortTitle: 'Мелеть',
    settlement: 'д. Мелеть',
    slug: 'melet',
    vkSources: ['https://vk.com/club231285524', 'https://vk.com/club148699922'],
  },
  {
    title: 'Новосмаильский сельский Дом культуры',
    shortTitle: 'Новая Смаиль',
    settlement: 'с. Новая Смаиль',
    slug: 'novaya-smail',
    vkSources: ['https://vk.com/public210710731'],
  },
  {
    title: 'Ново-Ирюкский сельский клуб',
    shortTitle: 'Новый Ирюк',
    settlement: 'д. Новый Ирюк',
    slug: 'novyy-iryuk',
    vkSources: ['https://vk.com/public209932114'],
  },
  {
    title: 'Плотбищенский сельский Дом культуры',
    shortTitle: 'Плотбище',
    settlement: 'п. Плотбище',
    slug: 'plotbishche',
    vkSources: ['https://vk.com/public184722506'],
  },
  {
    title: 'Поркитякский сельский клуб',
    shortTitle: 'Пор-Китяк',
    settlement: 'д. Пор-Китяк',
    slug: 'por-kityak',
    vkSources: ['https://vk.com/id453857219'],
    note: 'Учреждение ведёт личную страницу, а не сообщество.',
  },
  {
    title: 'Порезский сельский клуб',
    shortTitle: 'Порез',
    settlement: 'д. Порез',
    slug: 'porez',
    vkSources: ['https://vk.com/club224063767'],
  },
  {
    title: 'Преображенский сельский Дом культуры',
    shortTitle: 'Преображенка',
    settlement: 'д. Преображенка',
    slug: 'preobrazhenka',
    vkSources: ['https://vk.com/public139556708'],
  },
  {
    title: 'Пукшинерский сельский клуб',
    shortTitle: 'Пукшинерь',
    settlement: 'д. Пукшинерь',
    slug: 'pukshiner',
    vkSources: ['https://vk.com/club180555519'],
  },
  {
    title: 'Ральниковский сельский Дом культуры',
    shortTitle: 'Ральники',
    settlement: 'с. Ральники',
    slug: 'ralniki',
    vkSources: ['https://vk.com/club104890027'],
  },
  {
    title: 'Рожкинский сельский Дом культуры',
    shortTitle: 'Рожки',
    settlement: 'с. Рожки',
    slug: 'rozhki',
    vkSources: ['https://vk.com/public179595292'],
  },
  {
    title: 'Дом культуры деревни Старый Буртек',
    shortTitle: 'Старый Буртек',
    settlement: 'д. Старый Буртек',
    slug: 'staryy-burtek',
    vkSources: ['https://vk.com/club235045454'],
    note: 'Не путать со Старым Бурцом: тамошний клуб числится нерабочим.',
  },
  {
    title: 'Староирюкский сельский Дом культуры',
    shortTitle: 'Старый Ирюк',
    settlement: 'с. Старый Ирюк',
    slug: 'staryy-iryuk',
    vkSources: ['https://vk.com/club160755893'],
  },
  {
    title: 'Старотушкинский сельский Дом культуры',
    shortTitle: 'Старая Тушка',
    settlement: 'с. Старая Тушка',
    slug: 'staraya-tushka',
    vkSources: ['https://vk.com/id444820854'],
    note: 'Учреждение ведёт личную страницу, а не сообщество.',
  },
  {
    title: 'Дом культуры села Тат-Верх-Гоньба',
    shortTitle: 'Тат-Верх-Гоньба',
    settlement: 'с. Тат-Верх-Гоньба',
    slug: 'tat-verh-gonba',
    vkSources: ['https://vk.com/dkkumbashi'],
  },

  // Учреждения без найденного сообщества. Заводятся без ссылки: раздел на портале
  // им нужен, а импортировать пока нечего — появится страница, владелец впишет
  // ссылку, и синхронизация подхватит её сама.
  {
    title: 'Малокитякский сельский клуб',
    shortTitle: 'Малый Китяк',
    settlement: 'д. Малый Китяк',
    slug: 'malyy-kityak',
    note: 'Сообщество ВК не найдено — вероятно, его нет.',
  },
  {
    title: 'Нослинский сельский клуб',
    shortTitle: 'Нослы',
    settlement: 'д. Нослы',
    slug: 'nosly',
    note: 'Своего сообщества нет и не появится (решение владельца 01.09): людей на ведение страницы нет, события идут через Калинино. Раздел останется без ленты — не публиковать, если это не нужно.',
  },
  {
    title: 'Дерюшевский сельский клуб',
    shortTitle: 'Дерюшево',
    settlement: 'с. Дерюшево',
    slug: 'deryushevo',
    note: 'Своего сообщества нет и не появится (решение владельца 01.09): события идут через Калинино. Раздел останется без ленты — не публиковать, если это не нужно.',
  },
  {
    title: 'Дом культуры села Савали',
    shortTitle: 'Савали',
    settlement: 'с. Савали',
    slug: 'savali',
    note: 'ДК новый, в областном реестре ещё не значится; отдельного сообщества на 08.2026 не найдено.',
  },
]
