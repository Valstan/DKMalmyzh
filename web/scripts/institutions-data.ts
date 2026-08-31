// Справочник учреждений культуры Малмыжского района: населённый пункт, название,
// сообщество ВКонтакте.
//
// Собран 2026-08-31 из открытых источников: реестр КДУ Кировского областного дома
// народного творчества (единственный найденный полный перечень района — 29
// учреждений), карточки culture.ru, госвеб-сайты округа и поселений, поиск.
// Каждая ссылка проверена обращением к странице ВК: подтверждены имя, screen_name
// и owner_id. Данные не выдуманы и не восстановлены по памяти.
//
// Отсюда сеется черновой каталог (scripts/seed-institutions.ts). Черновики, а не
// публикации: перечень собран машиной по открытым источникам, и прежде чем
// показывать его району, владелец должен пройти карточки глазами.
//
// vkGroupUrl — единственное, что нужно импорту: owner_id он определит сам, в том
// числе знак (у сообщества отрицательный, у личной страницы положительный).

export type InstitutionSeed = {
  title: string
  shortTitle: string
  settlement: string
  slug: string
  vkGroupUrl?: string
  isHead?: boolean
  /** Заметка для владельца: что проверить руками. Идёт в описание карточки. */
  note?: string
}

export const INSTITUTIONS: InstitutionSeed[] = [
  {
    title: 'Малмыжский районный Центр культуры и досуга',
    shortTitle: 'РЦКД Малмыж',
    settlement: 'г. Малмыж',
    slug: 'rckd',
    vkGroupUrl: 'https://vk.com/dk_malmyzh',
    isHead: true,
    note: 'Головное учреждение. Помимо группы есть более активная личная страница vk.com/id234960216 — если записей из группы мало, ссылку стоит поменять на неё.',
  },
  {
    title: 'Калининская централизованная клубная система',
    shortTitle: 'Калинино',
    settlement: 'с. Калинино',
    slug: 'kalinino',
    vkGroupUrl: 'https://vk.com/kalinino_sdk',
    note: 'Отдельное юридическое лицо. Через эту страницу идут также события Дерюшева, Нослов и Старого Буртека.',
  },
  {
    title: 'Аджимский сельский Дом культуры',
    shortTitle: 'Аджим',
    settlement: 'с. Аджим',
    slug: 'adzhim',
    vkGroupUrl: 'https://vk.com/id420841463',
    note: 'Учреждение ведёт личную страницу. Есть также старая группа vk.com/club163930990 (без активности примерно с 2018).',
  },
  {
    title: 'Арыкский сельский Дом культуры',
    shortTitle: 'Арык',
    settlement: 'д. Арык',
    slug: 'aryk',
    vkGroupUrl: 'https://vk.com/club157904213',
  },
  {
    title: 'Большекитякский сельский Дом культуры',
    shortTitle: 'Большой Китяк',
    settlement: 'с. Большой Китяк',
    slug: 'bolshoy-kityak',
    vkGroupUrl: 'https://vk.com/club140412672',
  },
  {
    title: 'Большешабанский сельский клуб',
    shortTitle: 'Большая Шабанка',
    settlement: 'д. Большая Шабанка',
    slug: 'bolshaya-shabanka',
    vkGroupUrl: 'https://vk.com/public197439468',
  },
  {
    title: 'Большесатнурский сельский клуб',
    shortTitle: 'Большой Сатнур',
    settlement: 'д. Большой Сатнур',
    slug: 'bolshoy-satnur',
    vkGroupUrl: 'https://vk.com/club228720015',
  },
  {
    title: 'Верхнедеревенский сельский клуб',
    shortTitle: 'Верхняя',
    settlement: 'д. Верхняя',
    slug: 'verhnyaya',
    vkGroupUrl: 'https://vk.com/verhnyayaderevnya92922358',
  },
  {
    title: 'Гоньбинский сельский клуб',
    shortTitle: 'Гоньба',
    settlement: 'с. Гоньба',
    slug: 'gonba',
    vkGroupUrl: 'https://vk.com/club218487274',
  },
  {
    title: 'Каксинвайский сельский Дом культуры',
    shortTitle: 'Каксинвай',
    settlement: 'с. Каксинвай',
    slug: 'kaksinvay',
    vkGroupUrl: 'https://vk.com/club224505263',
    note: 'Есть вторая, более старая страница vk.com/public218593948 — проверить, какая ведётся сейчас.',
  },
  {
    title: 'Кинерский сельский клуб',
    shortTitle: 'Кинерь',
    settlement: 'д. Кинерь',
    slug: 'kiner',
    vkGroupUrl: 'https://vk.com/club182892169',
    note: 'В областном реестре учреждений клуба нет, но сообщество существует и активно. Проверить статус учреждения.',
  },
  {
    title: 'Константиновский сельский Дом культуры',
    shortTitle: 'Константиновка',
    settlement: 'с. Константиновка',
    slug: 'konstantinovka',
    vkGroupUrl: 'https://vk.com/club207374391',
    note: 'Есть более старая страница vk.com/club158250137.',
  },
  {
    title: 'Мари-Малмыжский сельский Дом культуры',
    shortTitle: 'Мари-Малмыж',
    settlement: 'с. Мари-Малмыж',
    slug: 'mari-malmyzh',
    vkGroupUrl: 'https://vk.com/club211149420',
    note: 'Есть более старая страница vk.com/club199379135.',
  },
  {
    title: 'Мелетский сельский клуб',
    shortTitle: 'Мелеть',
    settlement: 'д. Мелеть',
    slug: 'melet',
    vkGroupUrl: 'https://vk.com/club231285524',
    note: 'Новая страница филиала. Прежняя — vk.com/club148699922 (велась до 2024).',
  },
  {
    title: 'Новосмаильский сельский Дом культуры',
    shortTitle: 'Новая Смаиль',
    settlement: 'с. Новая Смаиль',
    slug: 'novaya-smail',
    vkGroupUrl: 'https://vk.com/public210710731',
  },
  {
    title: 'Ново-Ирюкский сельский клуб',
    shortTitle: 'Новый Ирюк',
    settlement: 'д. Новый Ирюк',
    slug: 'novyy-iryuk',
    vkGroupUrl: 'https://vk.com/public209932114',
  },
  {
    title: 'Плотбищенский сельский Дом культуры',
    shortTitle: 'Плотбище',
    settlement: 'п. Плотбище',
    slug: 'plotbishche',
    vkGroupUrl: 'https://vk.com/public184722506',
  },
  {
    title: 'Поркитякский сельский клуб',
    shortTitle: 'Пор-Китяк',
    settlement: 'д. Пор-Китяк',
    slug: 'por-kityak',
    vkGroupUrl: 'https://vk.com/id453857219',
    note: 'Учреждение ведёт личную страницу, а не сообщество.',
  },
  {
    title: 'Порезский сельский клуб',
    shortTitle: 'Порез',
    settlement: 'д. Порез',
    slug: 'porez',
    vkGroupUrl: 'https://vk.com/club224063767',
  },
  {
    title: 'Преображенский сельский Дом культуры',
    shortTitle: 'Преображенка',
    settlement: 'д. Преображенка',
    slug: 'preobrazhenka',
    vkGroupUrl: 'https://vk.com/public139556708',
  },
  {
    title: 'Пукшинерский сельский клуб',
    shortTitle: 'Пукшинерь',
    settlement: 'д. Пукшинерь',
    slug: 'pukshiner',
    vkGroupUrl: 'https://vk.com/club180555519',
  },
  {
    title: 'Ральниковский сельский Дом культуры',
    shortTitle: 'Ральники',
    settlement: 'с. Ральники',
    slug: 'ralniki',
    vkGroupUrl: 'https://vk.com/club104890027',
  },
  {
    title: 'Рожкинский сельский Дом культуры',
    shortTitle: 'Рожки',
    settlement: 'с. Рожки',
    slug: 'rozhki',
    vkGroupUrl: 'https://vk.com/public179595292',
  },
  {
    title: 'Дом культуры деревни Старый Буртек',
    shortTitle: 'Старый Буртек',
    settlement: 'д. Старый Буртек',
    slug: 'staryy-burtek',
    vkGroupUrl: 'https://vk.com/club235045454',
    note: 'Не путать со Старым Бурцом: тамошний клуб числится нерабочим.',
  },
  {
    title: 'Староирюкский сельский Дом культуры',
    shortTitle: 'Старый Ирюк',
    settlement: 'с. Старый Ирюк',
    slug: 'staryy-iryuk',
    vkGroupUrl: 'https://vk.com/club160755893',
  },
  {
    title: 'Старотушкинский сельский Дом культуры',
    shortTitle: 'Старая Тушка',
    settlement: 'с. Старая Тушка',
    slug: 'staraya-tushka',
    vkGroupUrl: 'https://vk.com/id444820854',
    note: 'Учреждение ведёт личную страницу, а не сообщество.',
  },
  {
    title: 'Дом культуры села Тат-Верх-Гоньба',
    shortTitle: 'Тат-Верх-Гоньба',
    settlement: 'с. Тат-Верх-Гоньба',
    slug: 'tat-verh-gonba',
    vkGroupUrl: 'https://vk.com/dkkumbashi',
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
    note: 'Своей страницы нет: события идут через Калининскую клубную систему.',
  },
  {
    title: 'Дерюшевский сельский клуб',
    shortTitle: 'Дерюшево',
    settlement: 'с. Дерюшево',
    slug: 'deryushevo',
    note: 'Своей страницы нет: события идут через Калининскую клубную систему.',
  },
  {
    title: 'Дом культуры села Савали',
    shortTitle: 'Савали',
    settlement: 'с. Савали',
    slug: 'savali',
    note: 'ДК новый, в областном реестре ещё не значится; отдельного сообщества на 08.2026 не найдено.',
  },
]
