import Image from 'next/image'
import React from 'react'

// Визуальный образ раздела учреждения — по пути, а не по Host (D-074).
//
// Тема — свойство карточки учреждения (`institutions.theme`). Обёртка меняет
// токены палитры для страницы раздела и записей этого учреждения и добавляет
// три узнаваемых элемента прежнего сайта Калинино: ленту с фразой, эмблему и
// гирлянду флажков внизу. Шапка и подвал портала остаются общими: раздел —
// часть матрёшки, а не второй сайт под видом раздела.
//
// Пустая тема — дети как есть, без лишнего элемента в DOM.

export type SectionThemeName = 'kalinino'

const THEMES: Record<
  SectionThemeName,
  { ribbon: string; emblem: string; garland: string; emblemAlt: string }
> = {
  kalinino: {
    ribbon: 'Калинино — здесь праздник собирает своих',
    emblem: '/brand/kalinino-emblem.webp',
    garland: '/brand/folk-garland.webp',
    emblemAlt: 'Эмблема Дома культуры села Калинино',
  },
}

export function themeOf(institution: unknown): SectionThemeName | null {
  if (!institution || typeof institution !== 'object') return null
  const theme = (institution as { theme?: unknown }).theme
  return theme === 'kalinino' ? theme : null
}

export function SectionTheme({
  theme,
  children,
}: {
  theme: SectionThemeName | null
  children: React.ReactNode
}) {
  if (!theme) return <>{children}</>
  const t = THEMES[theme]
  return (
    <div className={`section-theme section-theme--${theme}`}>
      <p className="section-theme__ribbon" aria-hidden="true">
        <span>✦</span>
        <span>{t.ribbon}</span>
        <span>✦</span>
      </p>
      <div className="section-theme__emblem">
        <Image src={t.emblem} alt={t.emblemAlt} width={120} height={120} />
      </div>
      {children}
      <div className="section-theme__garland" aria-hidden="true">
        <Image src={t.garland} alt="" width={1400} height={180} />
      </div>
    </div>
  )
}
