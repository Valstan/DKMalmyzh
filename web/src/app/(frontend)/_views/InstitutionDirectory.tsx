'use client'

import Link from 'next/link'
import React, { useMemo, useState } from 'react'

import { filterRows, type DirectoryRow } from '../../../lib/institutions/directory'

// Список учреждений с поиском по названию.
//
// Почему клиентский компонент, а не серверный: поиск пересчитывает список на
// лету, по мере ввода, без обращения к серверу. Учреждений тридцать одно, они
// приходят с сервера один раз и дальше живут в памяти браузера — «окно поиска»
// без обращения к с��рверу это и есть нужное ощущение скорости.
//
// ⚠️ Сюда нельзя импортировать ничего, что тянет `node:`-модули. Читаемое имя
// личного домена считается на сервере и приезжает готовым в `meta` — иначе
// сборка падает на `Reading from "node:url" is not handled by plugins`.

// Карточка вынесена отдельной функцией: у списка своё состояние (запрос), и
// перерисовывать весь список на каждый ввод было бы лишним.
function InstitutionCard({ row }: { row: DirectoryRow }) {
  const title = (
    <span className="dk-item__title">
      {/* Картинка декоративная — поэтому `aria-hidden`. Иначе озвучка читала бы
          её как слово впереди названия учреждения. */}
      <span className="dk-item__emoji" aria-hidden="true">
        {row.emoji}
      </span>
      {row.name || 'Без названия'}
    </span>
  )

  return (
    <li className="post-list__item dk-item">
      <h2>
        {row.name ? (
          row.external ? (
            // Внешняя ссылка — обычным <a>: роутер Next перехватывает только
            // внутренние переходы.
            //
            // `aria-label` — не украшение. Видимая подпись сокращена до имени села
            // («Калинино»), и без метки озвучка читала бы именно её: в списке из
            // тридцати одного пункта «Калинино» ничем не отличается от соседнего
            // «Савали» по смыслу. Имя ссылки — полное, как и было.
            <a href={row.url} title={row.fullName} aria-label={row.fullName}>
              {title}
            </a>
          ) : (
            <Link href={row.url} title={row.fullName} aria-label={row.fullName}>
              {title}
            </Link>
          )
        ) : (
          title
        )}
      </h2>
      {row.meta ? <p className="post-list__meta">{row.meta}</p> : null}
      {row.description ? <p>{row.description}</p> : null}
    </li>
  )
}

export function InstitutionDirectory({ rows }: { rows: DirectoryRow[] }) {
  const [query, setQuery] = useState('')
  const visible = useMemo(() => filterRows(rows, query), [rows, query])

  if (rows.length === 0) {
    return <p className="muted">Разделы учреждений скоро появятся.</p>
  }

  return (
    <>
      <div className="dk-search">
        <label className="dk-search__label" htmlFor="dk-search-input">
          Поиск учреждения
        </label>
        <input
          id="dk-search-input"
          className="dk-search__input"
          type="search"
          value={query}
          placeholder="например: китяк, или ка, или школа"
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
        />
        {/* aria-live: счётчик читается с экрана вслух при каждом нажатии клавиши —
            иначе озвучка молчит, а человек не знает, нашлось что-то или нет. */}
        <p className="dk-search__status" role="status" aria-live="polite">
          {query.trim()
            ? `Найдено ${visible.length} из ${rows.length}`
            : `Всего ${rows.length}`}
        </p>
      </div>

      {visible.length === 0 ? (
        <p className="muted">
          По запросу «{query.trim()}» ничего не нашлось. Попробуйте часть названия — например,
          только первые буквы села.
        </p>
      ) : (
        <ul className="post-list">
          {visible.map((row) => (
            <InstitutionCard key={row.id} row={row} />
          ))}
        </ul>
      )}
    </>
  )
}