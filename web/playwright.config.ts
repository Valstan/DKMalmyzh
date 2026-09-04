import { defineConfig, devices } from '@playwright/test'

// E2E-smoke: единственный гейт, который реально открывает страницы в браузере.
// До него сборка «зелёная» означала лишь, что модули компилируются: динамические
// маршруты (/news/[slug], /pages/[slug]) в пререндер не попадают — они `ƒ`, — и
// ошибка рендера конкретного документа не ловилась ничем.
//
// Сервер поднимается из прод-артефакта (`next start`), а не dev-сервером: гейт
// обязан проверять то, что поедет на прод. Порт 3005 — тот же, что у юнита на
// боксе; менять его тут без правки systemd-юнита нельзя.
const PORT = 3005
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Забытый .only не должен молча сузить гейт до одного теста.
  forbidOnly: Boolean(process.env.CI),
  // Ретраев нет намеренно. Главная ценность этих тестов — ловля `pageerror`, а
  // ошибки гидратации и холодного рендера проявляются как раз на ПЕРВОМ обращении
  // к маршруту: повторная попытка идёт по прогретому пути и проходит. Ретрай
  // превращал бы ровно тот отказ, ради которого гейт написан, в пометку flaky при
  // зелёном шаге. Тесты детерминированные, на одном воркере.
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // E2E_BASE_URL задан — гоняем по уже поднятому серверу (например, по проду);
  // иначе поднимаем свой. reuseExistingServer только вне CI: на раннере молча
  // подхваченный чужой сервер означал бы проверку не той сборки.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // Через npx, а не `pnpm start`: pnpm сверяет свою версию с packageManager
        // и на машине с другим pnpm отказывается стартовать вовсе. Гейту нужен
        // сервер, а не пакетный менеджер — бинарь берётся из node_modules напрямую.
        command: 'npx --no-install next start',
        url: baseURL,
        env: { PORT: String(PORT) },
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
