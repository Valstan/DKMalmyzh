import { timingSafeEqual } from 'crypto'

// Общая охрана служебных маршрутов `/internal/*`. Их два — заведение каталога
// учреждений и импорт из ВК, — и оба дёргаются локально (таймером systemd или
// воркфлоу по SSH) у уже работающего приложения: на прод едет standalone-бандл,
// payload CLI в него не входит, а писать надо в ту самую БД и тот самый каталог
// Media, которые есть только на боксе.
//
// Проверка одна на оба маршрута сознательно: разъехавшиеся копии одной и той же
// авторизации — это способ однажды забыть про constant-time в одной из них.
//
// Наружу `/internal/` закрыт ещё и `deny` в nginx-vhost. Одного секрета мало:
// публично доступный запускатор долгой задачи — это ещё и способ занять
// единственный vCPU бокса.

const HEADER = 'x-internal-secret'

export type Denial = { response: Response }

/**
 * Возвращает `null`, если запрос разрешён, иначе готовый отказ.
 *
 * Незаданный секрет означает «маршрут выключен», а НЕ «пускать всех»: пустая
 * строка в сравнении совпала бы с пустым заголовком, и служебная ручка
 * открылась бы ровно на тех стендах, где её забыли настроить.
 */
export function guardInternal(request: Request, operation: string): Denial | null {
  const expected = process.env.INTERNAL_OPS_SECRET?.trim()

  if (!expected) {
    return {
      response: Response.json(
        { error: `${operation}: INTERNAL_OPS_SECRET не задан — маршрут выключен` },
        { status: 503 },
      ),
    }
  }

  if (!matches(request.headers.get(HEADER), expected)) {
    return { response: Response.json({ error: 'нет доступа' }, { status: 403 }) }
  }

  return null
}

// Сравнение постоянного времени: наивное `===` на секрете даёт побайтовую
// утечку через время ответа, а маршрут по определению доступен без сессии.
// Длины сравниваем отдельно — timingSafeEqual на разных длинах бросает.
function matches(given: string | null, expected: string): boolean {
  if (!given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
