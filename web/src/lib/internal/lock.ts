// Замок служебных операций: одна пишущая операция на приложение за раз.
//
// Почему общий, а не по маршруту на каждый: `/internal/vk-sync` и
// `/internal/seed-institutions` пишут ОДНО И ТО ЖЕ поле `institutions.vkSources`.
// Импорт кладёт туда определённые owner_id, сид перезаписывает массив источников
// из справочника, подставляя owner_id из своего, уже устаревшего чтения. Два
// прогона внахлёст стирают кэш owner_id, и следующий импорт гонит resolveScreenName
// по всему району заново, упираясь в квоту шлюза 30 запросов в минуту.
//
// Почему замок в памяти процесса достаточен: на прод едет standalone-бандл, его
// поднимает один systemd-юнит одним процессом Node. Кластера и нескольких воркеров
// нет; появятся — замок переедет в БД (advisory lock PostgreSQL), и это станет
// видно по тому, что параллельные прогоны снова начнут ложиться на уникальность.
//
// Главное свойство: взятие замка СИНХРОННО. Проверка и установка не могут быть
// разнесены через await — между ними успевает встать второй запрос, и оба уходят
// работать. Ровно так авария 04.09 и случилась: таймер запустил второй прогон
// поверх первого, дубли легли на уникальность vkUid и filename в Media, а в
// журнале это выглядело как ошибка валидации поля, а не как гонка.

type Held = { operation: string; since: number }

let held: Held | null = null

export type LockHandle = { release: () => void }

export type LockBusy = { busy: true; operation: string; minutes: number }

/**
 * Берёт замок синхронно. Возвращает освободитель либо описание занятости.
 * Освобождать обязательно в `finally`, иначе операция останется «идущей» до
 * рестарта приложения.
 */
export function acquireInternalLock(operation: string): LockHandle | LockBusy {
  if (held) {
    return {
      busy: true,
      operation: held.operation,
      minutes: Math.round((Date.now() - held.since) / 60000),
    }
  }
  const mine: Held = { operation, since: Date.now() }
  held = mine
  let released = false
  return {
    release: () => {
      // Освобождаем только свой замок: повторный release после чужого взятия
      // не должен открывать дверь идущей операции.
      if (released || held !== mine) return
      released = true
      held = null
    },
  }
}

export function isBusy(value: LockHandle | LockBusy): value is LockBusy {
  return 'busy' in value
}

/** Ответ 409 с понятной строкой: занято другой операцией и сколько она идёт. */
export function busyResponse(busy: LockBusy): Response {
  return Response.json(
    { error: `служебная операция «${busy.operation}» уже идёт (${busy.minutes} мин)` },
    { status: 409 },
  )
}
