import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

import {
  CI_EVENT_TITLE,
  CI_INSTITUTION_SLUG,
  CI_INSTITUTION_TITLE_UPDATED,
  CI_PAGE_SLUG,
  CI_PAGE_TITLE,
  CI_POST_SLUG,
  CI_POST_TITLE_UPDATED,
} from '../scripts/ci-fixtures'
import { FESTIVALS } from '../src/lib/festivals'

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

  // Блок ближайших событий отбирает афиши с датой в будущем. Ветка исполняется
  // только когда такой документ есть — сид кладёт его специально.
  test('главная показывает предстоящую афишу и не показывает прошедшую', async ({ page }) => {
    await withoutPageErrors(page, async () => {
      await page.goto('/')
      const events = page.locator('section', { hasText: 'Ближайшие события' }).first()
      await expect(events.getByRole('link', { name: CI_EVENT_TITLE })).toBeVisible()
      await expect(events.getByRole('link', { name: CI_POST_TITLE_UPDATED })).toHaveCount(0)
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

  test('список домов культуры показывает засеянное учреждение', async ({ page }) => {
    await withoutPageErrors(page, async () => {
      const res = await page.goto('/dk')
      expect(res?.status()).toBe(200)
      await expect(page.getByRole('link', { name: CI_INSTITUTION_TITLE_UPDATED })).toBeVisible()
    })
  })

  // Второй динамический маршрут портала: раздел учреждения со своей лентой.
  // Как и /news/[slug], он `ƒ` — сборка его не исполняет.
  test('раздел дома культуры рендерится со своей лентой', async ({ page }) => {
    await withoutPageErrors(page, async () => {
      const res = await page.goto(`/dk/${CI_INSTITUTION_SLUG}`)
      expect(res?.status()).toBe(200)
      await expect(page.locator('h1')).toHaveText(CI_INSTITUTION_TITLE_UPDATED)
      // Сид кладёт афишу этого ДК — она обязана быть видна именно в его разделе.
      await expect(page.getByRole('link', { name: CI_POST_TITLE_UPDATED })).toBeVisible()
    })
  })

  test('несуществующий дом культуры даёт 404', async ({ page }) => {
    const res = await page.goto('/dk/такого-дк-нет')
    expect(res?.status()).toBe(404)
  })

  test('из общей ленты виден бейдж дома культуры', async ({ page }) => {
    await withoutPageErrors(page, async () => {
      await page.goto('/news')
      // .first(): у ДК в ленте несколько материалов, бейдж у каждого свой.
      const badge = page.getByRole('link', { name: 'CI', exact: true }).first()
      await expect(badge).toBeVisible()
      await badge.click()
      await expect(page.locator('h1')).toHaveText(CI_INSTITUTION_TITLE_UPDATED)
    })
  })

  // Праздники района (D-075): карточки ведут НА САЙТ праздника, не внутрь портала.
  //
  // Проверяются инварианты, а не тексты. Названия карточек пишут сами праздники и
  // присылают через Мозг — тест, прибитый к строке «Сабантуй Малмыж», падал бы на
  // первом же обновлении карточки, ничего при этом не проверяя по существу.
  test('праздники района — все карточки на месте и ведут наружу', async ({ page }) => {
    await withoutPageErrors(page, async () => {
      const res = await page.goto('/prazdniki')
      expect(res?.status()).toBe(200)
      await expect(page.locator('h1')).toHaveText('Праздники района')
      await expect(page.locator('.festival-card')).toHaveCount(FESTIVALS.length)

      for (const festival of FESTIVALS) {
        const link = page.locator(`.festival-card a[href="${festival.url}"]`).first()
        await expect(link, `нет ссылки на ${festival.host}`).toBeVisible()
      }
    })
  })

  // Канонический адрес задаётся постранично. Пока он жил в корневом layout, ВСЕ
  // страницы объявляли канонической главную, и раздел выпадал из индекса при
  // живом sitemap — расхождение, которое снаружи ничем себя не выдаёт.
  test('страницы объявляют канониклом себя, а не главную', async ({ page }) => {
    for (const path of ['/prazdniki', '/news', '/dk']) {
      await page.goto(path)
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href')
      expect(canonical, `canonical на ${path}`).toContain(path)
    }
    await page.goto('/')
    const home = await page.locator('link[rel="canonical"]').getAttribute('href')
    expect(home?.replace(/^https?:\/\/[^/]+/, '') || '/').toBe('/')
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
