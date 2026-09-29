# KulturaMalmyzh

**Портал «Культура Малмыжского района»** — культура.вмалмыже.рф: дома культуры
всего района, общая лента новостей, разделы учреждений, праздники. Контент —
импорт из VK (черновиками, публикует редактор) и ручное наполнение через админку.

Адреса проекта: культура.вмалмыже.рф — главный домен портала;
домкультуры.вмалмыже.рф — адрес раздела головного учреждения (ДК Малмыж, РЦКД),
алиас: отдаёт тот же сайт, имя в браузере сохраняется; сдк-калинино.вмалмыже.рф —
адрес раздела СДК Калинино, 301 на раздел портала.

**Стек:** Next.js 15 + Payload CMS 3.90.1 + PostgreSQL · TypeScript · pnpm 10 (corepack).
Язык интерфейса и контента — только русский (RU).

Приложение живёт в [`web/`](web/).

## Что внутри каркаса

Коллекции: `Users`, `Media`, `Pages` (статические страницы), `Posts` (новости).
Глобалы: `SiteHeader`, `SiteFooter`, `HomeContent` (тексты главной).
Фронт: главная (рендерит тексты + последние новости), `pages/[slug]`,
лента новостей `news` + `news/[slug]`, корневой layout с шапкой/подвалом.
Стиль — нейтральный, без оформления (декор/тема не переносились из донора).

## Быстрый старт (локально)

```bash
corepack prepare pnpm@10.15.0 --activate
corepack pnpm -C web install
cp web/.env.example web/.env        # подставить DATABASE_URI (БД dkmalmyzh) и PAYLOAD_SECRET
corepack pnpm -C web generate:importmap
corepack pnpm -C web generate:types
corepack pnpm -C web dev            # http://localhost:3005  ·  админка /admin
```

## Структура

| Путь | Что |
|---|---|
| [`web/`](web/) | Next + Payload приложение (коллекции, фронт, админка) |
| [`.github/workflows/`](.github/workflows/) | CI: `deploy-prod.yml`, `apply-migration.yml` |
| [`deploy/`](deploy/) | `dkmalmyzh.service` — systemd-юнит прод-сервера |

## Деплой (кратко)

Сборка едет в CI (GitHub Actions), на сервер по SSH кладётся standalone-артефакт,
рестартится systemd-юнит `dkmalmyzh.service`. Подробности — в `.github/workflows/deploy-prod.yml`.
Секреты/переменные репозитория и подготовку бокса делает оркестратор (brain).
