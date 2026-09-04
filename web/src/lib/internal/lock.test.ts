import { describe, expect, it } from 'vitest'

import { acquireInternalLock, busyResponse, isBusy } from './lock'

// Тест написан на тот дефект, который в проекте уже случился: замок, где проверка
// и установка разнесены через await, пропускает два прогона. Поэтому проверяется
// не «второй вызов после первого», а именно конкуренция вокруг точки ожидания.
describe('замок служебных операций', () => {
  it('второй вызов получает занятость, пока первый держит замок', () => {
    const first = acquireInternalLock('импорт из ВК')
    expect(isBusy(first)).toBe(false)

    const second = acquireInternalLock('заведение каталога')
    expect(isBusy(second)).toBe(true)
    if (isBusy(second)) {
      expect(second.operation).toBe('импорт из ВК')
    }

    if (!isBusy(first)) first.release()
  })

  it('после освобождения замок берётся снова', () => {
    const first = acquireInternalLock('импорт из ВК')
    if (!isBusy(first)) first.release()
    const second = acquireInternalLock('заведение каталога')
    expect(isBusy(second)).toBe(false)
    if (!isBusy(second)) second.release()
  })

  // Главный тест: обе «операции» стартуют, ждут на I/O и только потом делают
  // работу. С прежним замком (флаг после await) обе доходили до работы.
  it('гонка вокруг await пропускает ровно одну операцию', async () => {
    let entered = 0

    const operation = async () => {
      const lock = acquireInternalLock('операция')
      if (isBusy(lock)) return 'занято'
      try {
        // Точка ожидания внутри замка — именно здесь прежняя версия его теряла.
        await new Promise((resolve) => setTimeout(resolve, 5))
        entered += 1
        return 'сделано'
      } finally {
        lock.release()
      }
    }

    const results = await Promise.all([operation(), operation(), operation()])

    expect(entered).toBe(1)
    expect(results.filter((r) => r === 'сделано')).toHaveLength(1)
    expect(results.filter((r) => r === 'занято')).toHaveLength(2)
  })

  it('повторный release не открывает дверь чужой операции', () => {
    const first = acquireInternalLock('первая')
    if (isBusy(first)) throw new Error('замок неожиданно занят')
    first.release()

    const second = acquireInternalLock('вторая')
    expect(isBusy(second)).toBe(false)

    // Освободитель первой операции больше ничего не должен освобождать.
    first.release()

    const third = acquireInternalLock('третья')
    expect(isBusy(third)).toBe(true)

    if (!isBusy(second)) second.release()
  })

  it('ответ 409 называет операцию и время', async () => {
    const first = acquireInternalLock('импорт из ВК')
    const busy = acquireInternalLock('заведение каталога')
    expect(isBusy(busy)).toBe(true)
    if (isBusy(busy)) {
      const res = busyResponse(busy)
      expect(res.status).toBe(409)
      const body = (await res.json()) as { error: string }
      expect(body.error).toContain('импорт из ВК')
      expect(body.error).toContain('мин')
    }
    if (!isBusy(first)) first.release()
  })
})
