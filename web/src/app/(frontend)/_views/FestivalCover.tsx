'use client'

import { useState } from 'react'

// Обложка карточки праздника лежит на ЧУЖОМ домене: карточку присылает сам
// праздник, и копировать его логотип к себе мы не обязаны. Плата за это —
// доступность чужого сервера, которой мы не управляем: если он лёг, отдал
// 404-страницу вместо картинки или домен не продлили, посетитель увидит иконку
// битого изображения. И не только на /prazdniki: карточки стоят на первом
// экране главной.
//
// Поэтому клиентский компонент: серверному onError недоступен. Неудачная
// загрузка молча подменяется той же заглушкой, что у карточки без обложки, —
// раздел выглядит целым, даже когда сосед недоступен.
//
// referrerPolicy: на чужой хост не отправляем адрес нашей страницы.
export function FestivalCover({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div className="festival-card__cover festival-card__cover--empty" aria-hidden="true">
        ✦
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="festival-card__cover"
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  )
}
