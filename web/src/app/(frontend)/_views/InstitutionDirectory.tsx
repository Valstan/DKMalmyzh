'use client'

import Link from 'next/link'
import React, { useMemo, useState } from 'react'

import {
  filterInstitutions,
  institutionDisplayName,
  institutionEmoji,
  institutionFullName,
  type DirectoryItem,
} from '../../../lib/institutions/directory'
import { institutionDomainName } from '../../../lib/institutionsDomain'
import { institutionUrl } from '../../../lib/institutions'

// Список учреждений с поиском по названию.
//
// Почему клиентский компонент, а не серверный: поиск пересчитывает список на
// лету, по мере ввода, без обращения к серверу. Учреждений тридцать одно, они
// приходят с сервера один раз и дальше живут в памяти браузера — «окно поиска»
// без round-trip это и есть нужное ощущение скорости.
//
// Список учреждений приходит пропсом, а не запрашивается здесь: правила доступа к
// базе у клиента нет, и единственный честный способ отдать «только опубликованное»
// — прислать его с сервера.

// Отдельный компонент на карточку, а не инлайн-маппинг: у списка своё состояние
// (запрос), и перерисовывать его целиком на каждый ввод — лишнее. Карточка при
// этом остаётся серверной разметкой, то есть без гидрации ради каждой строки.
function InstitutionCard({ institution }: { institution: DirectoryItem }) {
  const url = institutionUrl(institution)
  const external = /^https?:\/\//i.test(url)
  const domain = institutionDomainName(institution)
  const name = institutionDisplayName(institution)

  return (
    <li className="post-list__item dk-item">
      <h2 className="dk-item__title">
        <span className="dk-item__emoji" aria-hidden="true">
          {institutionEmoji(institution)}
        </span>
        {name ? (
          external ? (
            <a href={url} title={institutionFullName(institution)}>
              {name}
            </a>
          ) : (
            <Link href={url} title={institutionFullName(institution)}>
              {name}
            </Link>
          )
        ) : (
          <span>Без названия</span>
        )}
      </h2>
      <p className="post-list__meta">
        {/* У дома культуры подпись — имя села, и полное название с родительным
            падежом в подписи «дублировало» бы его. Поэтому оно уходит в
            `title` у ссылки: доступно с курсором, но не кричит. */}
        {institution.isHead ? 'головное учреждение' : institution.settlement || ''}
        {domain ? ` · ${domain}` : ''}
      </p>
      {institution.description ? <p>{institution.description}</p> : null}
    </li>
  )
}

export function InstitutionDirectory({ institutions }: { institutions: DirectoryItem[] }) {
  const [query, setQuery] = useState('')
  const visible = useMemo(() => filterInstitutions(institutions, query), [institutions, query])

  if (institutions.length === 0) {
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
        <p className="dk-search__status" role="status" aria-live="polite">
          {query.trim()
            ? `Найдено ${visible.length} из ${institutions.length}`
            : `Всего ${institutions.length}`}
        </p>
      </div>

      {visible.length === 0 ? (
        <p className="muted">
          По запросу «{query.trim()}» ничего не нашлось. Попробуйте часть названия — например,
          только первые буквы села.
        </p>
      ) : (
        <ul className="post-list">
          {visible.map((institution) => (
            <InstitutionCard key={institution.id} institution={institution} />
          ))}
        </ul>
      )}
    </>
  )
}