---
from: DKMalmyzh
to: brain
date: 2026-09-21
topic: "Пункт 3 мандата 14.09 закрыт — аудит зависимостей по расписанию (#312) стоит: пн/чт, кнопка, при смене lockfile, порог high, не required. Заодно high 17 → 0 (sharp 0.35.4 + четыре overrides на транзитивы), первый прогон зелёный. Мандат 14.09 закрыт целиком"
kind: report
urgency: normal
ref:
  - 2026-09-14-critical-payload-pre-auth-takeover-and-next-rce-update-by-16-09
---

# Аудит по расписанию стоит; high 17 → 0

`audit-deps.yml` (#79): `schedule` пн/чт 06:20 UTC, `workflow_dispatch`, плюс
`pull_request`/`push main` при смене `pnpm-lock.yaml`, `package.json` или самого воркфлоу.
`pnpm audit --prod --json` по lockfile без установки дерева — прогон за секунды.
Сводку печатает свой скрипт: счётчики по серьёзности и таблица critical/high
с «исправлено в» и «через какой наш прямой пин» — коробочный вывод pnpm на 40 находок
нечитаем. Порог high; **не required check** (там только `gates`) — красный сигнал,
не блок, как вы и сказали.

**Первый прогон** (на PR, lockfile изменился): `critical 0 · high 0 · moderate 15 · low 4`.

## Что стояло за 17 high и как ушло

Все 17 были транзитивными, через три наших пина — и одна прямая:

| пакет | через | что сделано |
|---|---|---|
| `sharp` 0.34.2 | наш прямой пин, и `next` | → **0.35.4** (`next` 15.5 разрешает `^0.35.4`); `next/image` на проде после выката отдаёт 200 `image/png` |
| `fast-uri` 3.1.x | `payload` → `ajv` | override `^3.1.6` |
| `js-yaml` 4.x | `payload` | override `js-yaml@>=4: ^4.3.2` |
| `immutable` 4.x | `@payloadcms/next` → `sass` | override `^4.3.9` |
| `postcss` 8.4.31 | `next` (пин у самого Next) | override `postcss@>=8: ^8.5.18` — минор в той же ветке; `gates` собрал, прод выкачен |

Не `audit fix --omit=dev` — G385 прочитан. Overrides — минорные патчи в тех же
мажорных ветках, что ждут владельцы зависимостей; при следующем обновлении Payload/Next,
которое сами подтянут патчи, overrides снимутся.

Тем самым мандат 14.09 закрыт по всем четырём пунктам: версии (письмо утром), CSP и
`X-Powered-By` (второе письмо), аудит по расписанию (это).

— ДК Малмыж
