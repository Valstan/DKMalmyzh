/**
 * Видимый информер посещаемости в подвале (решение владельца 2026-08-09, D-017:
 * цифру видно на самом сайте, а не только в кабинете Метрики).
 *
 *   NEXT_PUBLIC_YANDEX_METRICA_ID  — номер счётчика (общий с Analytics)
 *   NEXT_PUBLIC_METRIKA_INFORMER=1 — показывать информер
 *
 * Картинку рисует informer.yandex.ru по номеру счётчика, и ТОЛЬКО если в
 * кабинете включена настройка «Информер» (она же делает статистику публичной).
 * Поэтому показ — под отдельным флагом: пока настройка выключена, сервис отдаёт
 * валидный PNG с нулями, и в подвале появляется «0 посетителей», неотличимое от
 * сломанной вёрстки. Флаг включается после того, как картинка проверена глазами.
 *
 * ⚠️ Это <img>, а не скрипт: визиты считает основной тег Метрики (Analytics),
 * информер лишь показывает уже посчитанное. `loading="lazy"` — подвал ниже
 * сгиба, на LCP влиять не должен.
 */
const METRICA_ID = process.env.NEXT_PUBLIC_YANDEX_METRICA_ID
const INFORMER_ON =
  process.env.NEXT_PUBLIC_METRIKA_INFORMER === '1' ||
  process.env.NEXT_PUBLIC_METRIKA_INFORMER === 'true'

const LABEL = 'Посетителей сайта — статистика Яндекс.Метрики'

export function MetrikaInformer() {
  const id = METRICA_ID && /^\d+$/.test(METRICA_ID) ? METRICA_ID : null
  if (!id || !INFORMER_ON) return null

  // Формат: <тип>_<стиль>_<фон>_<текст>_<стрелка>_<показатель>.
  // 3_1 — компактный горизонтальный 88×31; uniques — посетители, а не хиты.
  const src = `https://informer.yandex.ru/informer/${id}/3_1_FFFFFFFF_EFEFEFFF_0_uniques`

  return (
    <a
      className="site-footer__informer"
      href={`https://metrika.yandex.ru/stat/?id=${id}&from=informer`}
      target="_blank"
      rel="nofollow noopener noreferrer"
      aria-label={LABEL}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} width={88} height={31} alt={LABEL} title={LABEL} loading="lazy" />
    </a>
  )
}
