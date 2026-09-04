import { FESTIVALS, type Festival } from '../../../lib/festivals'

// Раздел «Праздники района» (D-075): карточки-ссылки на самостоятельные сайты
// праздников. Данные статические — `lib/festivals.ts`; карточек две, место для
// будущих есть по построению.

export function FestivalsView() {
  return (
    <section>
      <h1>Праздники района</h1>
      <p className="muted">
        У больших праздников Малмыжа свои сайты — здесь только карточки и ссылки на них.
      </p>
      <FestivalCards festivals={FESTIVALS} />
    </section>
  )
}

export function FestivalCards({ festivals }: { festivals: Festival[] }) {
  return (
    <ul className="festival-grid">
      {festivals.map((festival) => (
        <li key={festival.slug} className="festival-card">
          {festival.cover ? (
            // Обложка отдаётся сервером праздника по ссылке (не копией), поэтому
            // обычный <img>, а не next/image: чужой хост в remotePatterns не заводим.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="festival-card__cover"
              src={festival.cover.src}
              alt={festival.cover.alt}
              loading="lazy"
            />
          ) : (
            <div className="festival-card__cover festival-card__cover--empty" aria-hidden="true">
              ✦
            </div>
          )}
          <div className="festival-card__body">
            <h2 className="festival-card__title">
              <a href={festival.url} rel="noopener">
                {festival.title}
              </a>
            </h2>
            {festival.line ? <p>{festival.line}</p> : null}
            <p className="post-list__meta">
              {festival.season ? `${festival.season} · ` : ''}
              <a href={festival.url} rel="noopener">
                {festival.host} <span aria-hidden="true">↗</span>
              </a>
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}
