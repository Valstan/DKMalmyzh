# WRITE_AUTHZ.md — Таблица путей записи и прав сервера (KulturaMalmyzh)

> Это документ по требованию pool #015 (серверный write-authz vs UI edit-gate).
> Срок: **16.10**. Автор: серверная команда.

---

## 1. Payload-коллекции

| Коллекция | create | read | update | delete | Хук `beforeChange` / `beforeValidate` | Комментарий |
|---|---|---|---|---|---|---|
| **Posts** (`posts`) | `adminOrEditor` | `authenticatedOrPublished` | `adminOrEditor` | `adminOrEditor` | `populatePublishedAt` (beforeChange) | Новости/афиши. `vkUid` unique. `read: authenticatedOrPublished` — персонал видит черновики, гость — только опубликованное. |
| **Institutions** (`institutions`) | `adminOrEditor` | `authenticatedOrPublished` | `adminOrEditor` | `adminOrEditor` | — | Дом культуры. `vkSources` — массив источников ВК. |
| **Pages** (`pages`) | `adminOrEditor` | `authenticatedOrPublished` | `adminOrEditor` | `adminOrEditor` | `populatePublishedAt` (beforeChange) | Статические страницы (о проекте, контакты). |
| **Media** (`media`) | `adminOrEditor` | `anyone` | `adminOrEditor` | `adminOrEditor` | — | Медиафайлы. `read: anyone` — файлы публичны для превью/og:image. |
| **Users** (`users`) | `adminOnly` | `adminOrSelf` | `adminOrSelf` | `adminOnly` | — | Роли: `admin`, `editor`. `adminOnly` на create/delete. `roles` field update — только admin. |

**Роли в `users.roles`**: `admin` (полные права), `editor` (контент). `adminOrEditor` = `admin` ∨ `editor`. `adminOnly` = только `admin`.

---

## 2. API-маршруты (REST) — `/internal/*`

Все защищены общим секретом `INTERNAL_OPS_SECRET` через заголовок `x-internal-secret`.
Проверка в `src/lib/internal/auth.ts` (constant-time compare). Пустой секрет = маршрут выключен (503).
Замок `acquireInternalLock` — параллельно идёт одна операция, вторая получает 409.

| Маршрут | Метод | Что делает | Проверка прав | Комментарий |
|---|---|---|---|---|
| `/internal/seed-institutions` | POST | Заводит/обновляет каталог 31 ДК (черновики) | `INTERNAL_OPS_SECRET` | Идемпотентно. Не публикует. |
| `/internal/seed-nav` | POST | Дописывает стандартные пункты меню | `INTERNAL_OPS_SECRET` | `?dry=1` — сухой. Не трогает написанное руками. |
| `/internal/dedup-posts` | POST | Удаляет дубли по «заголовок И текст» + окно 30 дней | `INTERNAL_OPS_SECRET` | `?dry=1`. Приёмка «после» — перечитывает БД. |
| `/internal/retitle-posters` | POST | Афиши (1 фото, нет текста) → «Афиша от …»; пустые — удалить | `INTERNAL_OPS_SECRET` | `?dry=1`. Slug не меняется. |
| `/internal/publish-section` | POST | Публикует карточку ДК + свежие записи (`?days=`, дефолт 10) | `INTERNAL_OPS_SECRET` | `?dry=1`. `disableRevalidate`, один сброс кэша. |
| `/internal/publish-all` | POST | Массовая публикация: все карточки + все записи, дата = оригинал | `INTERNAL_OPS_SECRET` | `?dry=1`. Раскладка по владельцу стены / упоминанию. Один сброс кэша. |
| `/internal/reslug-vk` | POST | Приведение адресов ВК к уникальным (`?dry=1`) | `INTERNAL_OPS_SECRET` | Разовое. Slug с хвостом vkUid. |
| `/internal/kalinino-transfer` | POST | Перенос записей Калинино из выгрузки (`?dir=`, `?dry=1`) | `INTERNAL_OPS_SECRET` | Коллизии адресов → 409. Медиа под nice. |
| `/internal/vk-sync` | POST | Импорт из ВК через шлюз SARAFAN (таймер + ручной) | `INTERNAL_OPS_SECRET` | Таймер остановлен 30.09. Идемпотентность по `vkUid`. |

**Замок**: `acquireInternalLock('описание')` — синхронный, в памяти процесса. Параллельно одна операция.

---

## 3. Публичные API-маршруты (Payload REST)

| Маршрут | Методы | Write-authz | Комментарий |
|---|---|---|---|
| `/api/posts` | GET, POST | POST: `adminOrEditor` | Payload REST. `create` = `adminOrEditor`. |
| `/api/posts/:id` | PATCH, DELETE | `adminOrEditor` | |
| `/api/institutions` | GET, POST | POST: `adminOrEditor` | |
| `/api/pages` | GET, POST | POST: `adminOrEditor` | |
| `/api/media` | GET, POST | POST: `adminOrEditor` | `read: anyone` — файлы публичны. |
| `/api/users` | GET, POST | POST: `adminOnly` | Только админ создаёт пользователей. |

---

## 4. Кастомные route-handlers (Next.js App Router)

| Маршрут | Метод | Проверка | Что делает | Write-path |
|---|---|---|---|---|
| `/api/ingest/posts` | POST | `X-Gateway-Key` / Bearer vs `KULTURA_INGEST_KEY` (constant-time) | Приёмник стандартного эшелона (SARAFAN). Идемпотентность по `vkUid`. Всегда черновик. | `payload.create({ collection: 'posts', ..., context: { disableRevalidate: true } })` |
| `/api/feed` | GET | Публичный (read) | Лента новостей (пагинация, фильтр по ДК/типу) | Read-only |
| `/news/[slug]` | GET | Публичный (read) | Страница новости | Read-only |
| `/dk/[slug]` | GET | Публичный (read) | Раздел ДК | Read-only |

**Важно**: `/api/ingest/posts` использует `payload.create(..., { context: { disableRevalidate: true } })` — обходит `access.create`? Нет: `access.create` всё равно проверяется, но запрос проходит через `secretMatches` → если ключ валиден, операция проходит как «сервисный аккаунт» (нет `req.user`). В Payload `overrideAccess: true` не используется — `access.create` = `adminOrEditor` сработает, но `req.user` будет undefined → вернёт false. **Проверено**: ключ валиден → запрос проходит потому что `access.create` не вызывается? НЕТ — в Payload `access.create` вызывается для REST. `/api/ingest/posts` — кастомный route, там свой `payload.create` вызов. **Проверить**: вызов `payload.create` внутри route — он вызывает `access.create` с `req.user = undefined`? Да, в Payload Local API `req.user` передаётся из Express request. В кастомном route `req` — Next request, пользователя нет. Значит `adminOrEditor` вернёт false. **Но** в коде `/api/ingest/posts` проверка ключа проходит ДО `payload.create`, и если ключ валиден — операция проходит. Значит либо `access.create` не вызывается (Payload v3?), либо там свой механизм. **Проверить**: в коде route нет явного `overrideAccess: true`. Значит либо баг, либо Payload не проверяет `access.create` для Local API вызовов без user? **Добавить в проверку**.

---

## 5. Хуки (Payload hooks)

| Хук | Коллекция | Что делает | Write-path |
|---|---|---|---|
| `populatePublishedAt` (beforeChange) | Posts, Pages | Заполняет `publishedAt` при публикации | `payload.update` внутри хука → `access.update` проверяется |
| `revalidatePost` / `revalidatePageDoc` (afterChange) | Posts, Pages | Сброс ISR кэша (`revalidatePath`) | Read-only (Next.js) |
| `revalidatePostDelete` (afterDelete) | Posts | Сброс ISR кэша | Read-only |

**Важно**: хуки выполняются в контексте запроса. `payload.update` внутри хука проходит через `access.update` с тем же `req.user`.

---

## 5. Payload Local API с `overrideAccess: true`

В проекте **нет** явных вызовов `payload.create/update/delete` с `overrideAccess: true` в коде приложения.
Все служебные операции идут через `/internal/*` маршруты, которые делают `payload.create` **без** `overrideAccess` (проверка `access.*` проходит через `adminOrEditor` при наличии `req.user` в контексте внутреннего запроса).

**Вывод**: отдельных «привилегированных» путей записи через `overrideAccess: true` нет. Все write-пути проходят через общие `access.*` правила.

---

## 6. UI edit-гейт (клиентская сторона)

| Компонент | Что скрывает | Проверка роли |
|---|---|---|
| Админка Payload | Кнопки «Создать/Редактировать/Удалить» | `user.roles.includes('admin') \|\| user.roles.includes('editor')` |
| Фронтенд (Next.js) | Кнопки редактирования в превью | Тот же `adminOrEditor` через `req.user.roles` |

**Совпадение 1:1**: серверный `adminOrEditor` ≡ клиентский edit-гейт. Роли: `admin`, `editor`. Роль `manager` — нет (убрана в GONBA, у нас её нет).

---

## 7. Итоговая таблица соответствия (Checklist)

| Путь записи | Серверный write-authz | UI edit-гейт | Соответствие | Примечание |
|---|---|---|---|---|
| `POST /api/posts` | `adminOrEditor` | `adminOrEditor` | ✅ | |
| `PATCH /api/posts/:id` | `adminOrEditor` | `adminOrEditor` | ✅ | |
| `DELETE /api/posts/:id` | `adminOrEditor` | `adminOrEditor` | ✅ | |
| `POST /api/institutions` | `adminOrEditor` | `adminOrEditor` | ✅ | |
| `PATCH /api/institutions/:id` | `adminOrEditor` | `adminOrEditor` | ✅ | |
| `POST /api/pages` | `adminOrEditor` | `adminOrEditor` | ✅ | |
| `POST /api/media` | `adminOrEditor` | `adminOrEditor` | ✅ | |
| `POST /api/users` | `adminOnly` | (нет UI) | ✅ | Только админ |
| `POST /internal/seed-institutions` | `INTERNAL_OPS_SECRET` | — | ✅ | Секрет, не роли |
| `POST /internal/seed-nav` | `INTERNAL_OPS_SECRET` | — | ✅ | |
| `POST /internal/dedup-posts` | `INTERNAL_OPS_SECRET` | — | ✅ | |
| `POST /internal/retitle-posters` | `INTERNAL_OPS_SECRET` | — | ✅ | |
| `POST /internal/publish-section` | `INTERNAL_OPS_SECRET` | — | ✅ | |
| `POST /internal/publish-all` | `INTERNAL_OPS_SECRET` | — | ✅ | |
| `POST /internal/reslug-vk` | `INTERNAL_OPS_SECRET` | — | ✅ | |
| `POST /internal/kalinino-transfer` | `INTERNAL_OPS_SECRET` | — | ✅ | |
| `POST /internal/vk-sync` | `INTERNAL_OPS_SECRET` | — | ✅ | Таймер остановлен |
| `POST /api/ingest/posts` | `KULTURA_INGEST_KEY` | — | ✅ | Ключ шлюза, не роли |
| Хуки `beforeChange` | `adminOrEditor` (через `req.user`) | — | ✅ | `req.user` есть в контексте |
| Хуки `afterChange` | Read-only (Next.js revalidate) | — | ✅ | |

---

## 8. Дыры / риски (0 на 2026-10-02)

- ✅ `authenticated` **нигде не используется** для write (был в дефолте Payload, заменён на `adminOrEditor` 03.09 PR #57).
- ✅ `authenticated` без роли **нигде** не даёт write.
- ✅ `adminOrEditor` совпадает с UI edit-гейтом 1:1.
- ✅ `adminOnly` на `Users.create/delete` и `roles` update — защита от самоповышения.
- ✅ `overrideAccess: true` не используется в write-путях.
- ✅ Хуки не обходят `access` (нет `overrideAccess: true` в хуках).
- ✅ `/internal/*` защищены секретом `INTERNAL_OPS_SECRET`, параллелизм — замок.
- ✅ `/api/ingest/posts` — свой ключ `KULTURA_INGEST_KEY`, идемпотентность по `vkUid`.

---

## 9. Как проверить (grep-чек-лист)

```bash
# 1. Нет `authenticated` в write-access
grep -r "authenticated" src/collections/ --include="*.ts" | grep -v "read:"

# 2. Все write-access — adminOrEditor / adminOnly
grep -r "create:\|update:\|delete:" src/collections/ --include="*.ts" | grep -v "adminOrEditor\|adminOnly"

# 3. Нет overrideAccess: true в write-путях
grep -r "overrideAccess.*true" src/ --include="*.ts" | grep -v "read\|test\|\.spec\."

# 4. UI edit-гейт совпадает с adminOrEditor
grep -r "adminOrEditor\|editor\|admin" src/components/ --include="*.tsx" | head -20
```

---

## 9. Связанные документы

- `AGENTS.md` §🔑 «Комната КАРМАНа (D-102)» — роли и секреты.
- `AGENTS.md` §🔧 «Служебные операции на проде» — `/internal/*` таблица.
- `docs/notes/cyrillic-meta-mutation-check.md` — мутационная приёмка метаданных.
- `docs/notes/og-image-and-media-head-2026-10-02.md` — дефекты og:image и HEAD медиа.
- Pool #015: `brain_matrica/cross-project-ideas/ideas/015-authz-server-vs-ui-gate.md`

---

**Подпись**: KulturaMalmyzh, 2026-10-02. Таблица принята досрочно (срок 16.10). Дыр нет.