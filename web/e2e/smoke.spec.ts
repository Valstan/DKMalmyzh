import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

import {
  CI_PAGE_SLUG,
  CI_PAGE_TITLE,
  CI_POST_SLUG,
  CI_POST_TITLE_UPDATED,
} from '../scripts/ci-fixtures'

// Ошибки страницы (uncaught exception в браузере) не роняют ответ сервера: HTTP
// остаётся 200, разметка приходит, а гидратация ложится. Гейт, смотрящий только
// на статус, такое пропускает — поэтому каждый переход слушает pageerror.
async function withoutPageErrors(page: Page, body: () => Promise<void>): Promise<void> {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))
  await body()
  expect(errors, 'необработанные ошибки в браузере').toEqual([])
}

test.describe('публичные страницы открываются в браузере', () => {
  test('главная', async ({ page }) => {
    await withoutPageErrors(page, async () => {
      const res = await page.goto('/')
      expect(res?.status()).toBe(200)
      await expect(page.locator('h1')).toBeVisible()
    })
  })

  test('лента новостей показывает засеянную новость', async ({ page }) => {
    await withoutPageErrors(page, async () => {
      const res = await page.goto('/news')
      expect(res?.status()).toBe(200)
      await expect(page.getByRole('link', { name: CI_POST_TITLE_UPDATED })).toBeVisible()
    })
  })

  // Ради этого теста всё и затевалось: /news/[slug] остаётся `ƒ` и в пререндер не
  // попадает, поэтому ошибка рендера конкретного документа до сих пор не ловилась
  // ни сборкой, ни сидом.
  test('новость по slug рендерится целиком', async ({ page }) => {
    await withoutPageErrors(page, async () => {
      const res = await page.goto(`/news/${CI_POST_SLUG}`)
      expect(res?.status()).toBe(200)
      await expect(page.locator('h1')).toHaveText(CI_POST_TITLE_UPDATED)
      await expect(page).toHaveTitle(new RegExp(CI_POST_TITLE_UPDATED.replace(/[()]/g, '\\$&')))
    })
  })

  test('страница по slug рендерится целиком', async ({ page }) => {
    await withoutPageErrors(page, async () => {
      const res = await page.goto(`/pages/${CI_PAGE_SLUG}`)
      expect(res?.status()).toBe(200)
      await expect(page.locator('h1')).toHaveText(CI_PAGE_TITLE)
    })
  })

  // Переход по ссылке, а не по собранному URL: проверяет, что лента отдаёт
  // рабочие адреса. Расхождение slug'а в ссылке и в маршруте прямой goto не ловит.
  test('из ленты можно перейти в новость', async ({ page }) => {
    await withoutPageErrors(page, async () => {
      await page.goto('/news')
      await page.getByRole('link', { name: CI_POST_TITLE_UPDATED }).click()
      await expect(page.locator('h1')).toHaveText(CI_POST_TITLE_UPDATED)
      expect(new URL(page.url()).pathname).toBe(`/news/${CI_POST_SLUG}`)
    })
  })

  test('несуществующая новость даёт 404, а не пустую страницу', async ({ page }) => {
    const res = await page.goto('/news/такого-slug-нет')
    expect(res?.status()).toBe(404)
  })

  // Админка — отдельный бандл со своей картой импортов (generate:importmap).
  // Сборка её собирает, но не исполняет; сюда она попадает ради того, что ломается
  // именно в рантайме. На пустой БД Payload отдаёт создание первого пользователя —
  // нам всё равно, какая из двух форм, важно что форма с почтой отрисовалась.
  test('админка отдаёт рабочую форму', async ({ page }) => {
    const res = await page.goto('/admin')
    expect(res?.status()).toBe(200)
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 30_000 })
  })
})
