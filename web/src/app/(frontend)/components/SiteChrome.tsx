import Image from 'next/image'
import Link from 'next/link'
import React from 'react'

import { SITE_NAME } from '../../../lib/site'

export type NavItem = { label: string; href: string }
export type ChromeContent = {
  brand: string | null
  nav: NavItem[]
  copyright: string | null
  contacts: string | null
} | null

// Шапка + подвал сайта. Тексты приходят из глобалов header/footer (могут быть
// пустыми в свежем каркасе) — тогда падаем на код-фолбэк.
export function SiteChrome({
  chrome,
  children,
}: {
  chrome: ChromeContent
  children: React.ReactNode
}) {
  const brand = chrome?.brand || SITE_NAME
  const nav = chrome?.nav?.length ? chrome.nav : [{ label: 'Новости', href: '/news' }]
  const copyright = chrome?.copyright || `© ${new Date().getFullYear()} ${SITE_NAME}`

  return (
    <div className="site">
      <header className="site-header">
        <div className="celebration-ribbon" aria-hidden="true">
          <span>✦</span>
          <span>Добро пожаловать туда, где живёт праздник!</span>
          <span>✦</span>
        </div>
        <div className="container site-header__inner">
          <Link href="/" className="site-brand">
            <span className="site-brand__mark">
              <Image src="/brand/mary-emblem.png" alt="" width={116} height={116} priority />
            </span>
            <span className="site-brand__text">
              <small>Районный центр культуры и досуга</small>
              <strong>{brand}</strong>
            </span>
          </Link>
          <nav className="site-nav" aria-label="Основная навигация">
            {nav.map((item, i) => (
              <Link key={`${item.href}-${i}`} href={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="site-main container">{children}</main>

      <footer className="site-footer">
        <div className="site-footer__burst" aria-hidden="true">
          ♪ ✦ ❀ ✺ ♫ ❋ ✦ ♪
        </div>
        <div className="container site-footer__inner">
          <div>
            <p className="site-footer__eyebrow">Встречаемся на празднике!</p>
            {chrome?.contacts ? <p className="site-footer__contacts">{chrome.contacts}</p> : null}
            <p className="site-footer__copyright">{copyright}</p>
            <p className="site-footer__author">
              Сделано программистом{' '}
              <a
                href="https://xn--80adkmnnb2b.xn--80adkdyec4j.xn--p1ai/"
                rel="author noopener"
                target="_blank"
              >
                Валентином Савиных
              </a>
            </p>
          </div>
          <Image
            className="site-footer__mark"
            src="/brand/mary-emblem.png"
            alt="Летящая с зонтом сказочная героиня — эмблема Дома культуры"
            width={230}
            height={230}
          />
        </div>
      </footer>
    </div>
  )
}
