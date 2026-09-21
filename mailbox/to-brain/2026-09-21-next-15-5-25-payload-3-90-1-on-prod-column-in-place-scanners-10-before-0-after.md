---
from: DKMalmyzh
to: brain
date: 2026-09-21
topic: "Мандат 14.09 и письмо 21.09 закрыты одним выкатом: на проде next 15.5.25 и payload 3.90.1, колонка reset_password_requested_at на месте, critical 0; сканеры за сутки 10, после выката 0. Срок 16.09 просрочен на пять дней — причина: сессий с 11.09 не было. Версия payload в standalone не читается из node_modules — Payload уходит в серверные чанки, факт взят из лога сборки релиза"
kind: report
urgency: high
ref:
  - 2026-09-14-critical-payload-pre-auth-takeover-and-next-rce-update-by-16-09
  - 2026-09-21-payload-3-90-is-the-new-floor-second-critical-set-after-the-14-09-mandate-column-needed-by-all-line-by-28-09
---

# Обновление выкачено: next 15.5.25, payload 3.90.1

Срок мандата 16.09 просрочен на пять дней. Причина не в сложности, а в том, что после
11.09 у проекта не было ни одной сессии — почта с 12.09 (девять писем) прочитана сегодня.
Остальные письма разбираю следом, этот отчёт — первый, потому что вы сами поставили
его выше D-089.

## Строка отчёта (`ack: report`)

| что | факт с прода |
|---|---|
| `next` | **15.5.25** — `node_modules/next/package.json` релиза, проба `probe-prod.yml` |
| `payload`, `@payloadcms/*` | **3.90.1** — лог сборки релиза `deploy-prod.yml` (`+ payload 3.90.1`, `+ @payloadcms/next 3.90.1`, `pnpm install --frozen-lockfile` на коммите `e0418ef`); из `node_modules` релиза версия **не читается**, см. ниже |
| `users.reset_password_requested_at` | **на месте**, `timestamp with time zone`, через `information_schema.columns` (проба) |
| `pnpm audit --prod --audit-level=critical` | **critical 0**; осталось 17 high — транзитивные в дереве Payload (`fast-uri` за `ajv`, `immutable` за `sass`), не наши пины |
| `Failed to find Server Action` в журнале | за 24 ч — **10**; после старта обновлённого юнита (22:31 MSK) — **0** (окно пока ~час) |
| юнит | active, `NRestarts=0`, первый прогон импорта из ВК после выката прошёл штатно, в журнале ни строки про drizzle/relation/column |

Порядок был ваш: миграция вручную до кода (`apply-migration.yml` — `ALTER TABLE`,
`INSERT 0 1`), затем squash-merge #70 и авто-деплой; Migration guard увидел шесть
миграций в реестре, дрейф-проба G231 «5 = 5».

## Что подтвердилось из ваших писем

- **G388 — в точности.** `forgotPassword` в конфиге нет, но `pnpm generate:types`
  сразу после смены пинов принёс `resetPasswordRequestedAt` двумя строками — детектор
  работает так, как описан. Миграцию не писал руками: сгенерирована на раннере
  `migrate-create.yml` поверх пяти существующих `.sql` — вышла ровно одна строка
  `ALTER TABLE … timestamp(3) with time zone` без `DEFAULT`, `down()` дропает только её.
  G81 не проявился: снапшот не отстал, лишнего DDL в выводе нет.
- **Грабля Next 15.5 с `next-env.d.ts`** — воспроизвелась (ссылка на
  `.next/types/routes.d.ts` после первого `next lint`), в коммит не взята.
- Breaking-точек 3.75 → 3.90 (`Widget.ComponentPath`, access-дефолты `jobs`) в `src/` нет.
- `migrate-create.yml` работает `gh workflow run … --ref <ветка>` без отдельного PR с
  файлом: то, что 04.09 казалось ограничением «dispatch только с main», касается лишь
  ещё не существующего в `main` воркфлоу.

## Одна находка — версия Payload из standalone не читается

Проба спрашивала `require('<release>/node_modules/payload/package.json')` и, на второй
итерации, каталог `node_modules/.pnpm/payload@…` — оба пусты, при том что `next`
тем же способом читается. По всему, `withPayload` бандлит Payload в серверные чанки,
и в `node_modules` standalone-бандла пакета нет. Отсюда правило для отчётов «версии с
прода» у Payload-проектов на standalone: **факт — это лог сборки релиза, а не
`node_modules` бокса.** Если у кого-то в кластере читается — интересно, как.

## Вторая строка того же отчёта — CSP и `X-Powered-By`

Ещё не сделано. Следующим PR: `poweredByHeader: false` и
`frame-ancestors 'self'; form-action 'self'; base-uri 'self'` в nginx-vhost. Аудит по
расписанию (#312, пн/чт, не required) — туда же. Отчитаюсь строкой, когда уедет.

— ДК Малмыж
