# AGENTS.md — единые правила для AI-агентов «ДК Малмыж»

Этот файл — **единственный канонический вход для любой нейросети**: Claude Code, Codex, Gemini CLI и других агентов. Инструкции конкретного инструмента (`CLAUDE.md`, `GEMINI.md`) могут дополнять его, но не должны дублировать или переопределять проектные правила.

## Состояние проекта

- **Что это:** сайт **РЦКД г.Малмыж** (районный Центр культуры и досуга, Дом культуры) — **домкультуры.вмалмыже.рф** (punycode `xn--d1amdcjpngc5fh.xn--80adkdyec4j.xn--p1ai`); малмыж-кластер вместе с вМалмыже и Калинино ЦКС.
- ⚠️ Прежний домен **дкмалмыж.рф выведен из обращения** (регистрация истекла, решение владельца 2026-08-02 — не продлевать). Нигде не использовать, в новый код не возвращать.
- **Прод:** https://домкультуры.вмалмыже.рф/ — **Бокс 1** (`831d0ce99bdf.vps.myjino.ru`, 92.51.22.114), порт **:3005**. TLS терминирует **сам nginx на боксе** (certbot/LE), внешнего прокси Джино тут нет. vhost едет из репо: `deploy/nginx-dkmalmyzh-tls.conf` (рабочий) / `deploy/nginx-dkmalmyzh.conf` (бутстрап :80, пока нет сертификата) — деплой сам выбирает по наличию `/etc/letsencrypt/live/<domain>/`. Выпуск сертификата — `.github/workflows/setup-tls.yml` (webroot; `--nginx` нельзя: правки certbot в vhost затрёт деплой).
- ⚠️ **Бокс делят несколько сайтов** (гоньба.рф, вмалмыже.рф, калинино, тренер, karman). У гоньбы `listen 443 ssl default_server` — https без совпадения по `server_name` уходит к ней. Поэтому smoke-проверки обязаны смотреть **контент-маркер** («РЦКД»), а не только код 200: 200 отдаст и сосед. Диагностика — `.github/workflows/probe-nginx.yml` (read-only, `nginx -T`).
- **Стек:** Next.js 15 App Router + **Payload 3.75 + PostgreSQL** (стандарт экосистемы, стек Сабантуя), pnpm, standalone-сборка в CI.
- **Статус:** ⏸ **каркас на проде, ждёт наполнения контентом владельцем** (из ВК) — это осознанная пауза by design, не заброшенность.
- **Код сайта — в `web/`**, деплой-обвязка — в `deploy/`.
- Карточка проекта: [`../brain_matrica/projects/DKMalmyzh.md`](../brain_matrica/projects/DKMalmyzh.md). Концепт малмыж-кластера: [`../brain_matrica/docs/plans/malmyzh-sites-rebuild-concept.md`](../brain_matrica/docs/plans/malmyzh-sites-rebuild-concept.md).
- Локальная память последней сессии: [`docs/SESSION_HANDOFF.md`](docs/SESSION_HANDOFF.md).

`brain_matrica` разрешено только **читать**. Никогда не изменяй и не коммить файлы в `../brain_matrica/`. Предложения Мозгу оформляй в `mailbox/to-brain/*.md` этого репозитория.

## Начало и завершение работы

В начале работы:

1. Сначала синхронизируй **этот** репозиторий (`git fetch`, затем безопасный fast-forward).
2. Синхронизируй `../brain_matrica` только fast-forward и только при чистом дереве.
3. Прочитай входящие `../brain_matrica/mailboxes/DKMalmyzh/from-brain/*.md` (см. §Mailbox).
4. Прочитай `docs/SESSION_HANDOFF.md` и проверь `git status` / последние коммиты.

В конце значимой работы обнови `docs/SESSION_HANDOFF.md`, сохрани изменения через PR и оставь оба репозитория синхронизированными и чистыми.

Исполняемые памятки лежат в `.claude/commands/`: [`start.md`](.claude/commands/start.md), [`close_session.md`](.claude/commands/close_session.md), [`obriv.md`](.claude/commands/obriv.md). Несмотря на имя каталога, их workflow применим **любому** агенту. Правило чтения памяток агентом без соответствующего инструмента: `allowed-tools:` игнорировать; `/команда` = «выполни шаги файла»; указание вида `AskUserQuestion: «…»` = «задай вопрос и дождись явного ответа»; **форма любая, шаг обязателен**.

## 📬 Mailbox (ADR-0001 v3)

Асимметричные mailbox'ы: каждая сторона пишет только в свой репо.

| Направление | Кто пишет | Где |
|---|---|---|
| `brain → ДК Малмыж` | brain | `../brain_matrica/mailboxes/DKMalmyzh/from-brain/*.md` (мы только **читаем** после `git pull --ff-only`) |
| `ДК Малмыж → brain` | мы | **`mailbox/to-brain/*.md`** в этом репо (через PR) |

Сканить только корень `from-brain/` (не `DRAFTS/`, не `ARCHIVE/`). Compliance: `mandate`→MUST, `recommend`→SHOULD (отказ обосновать письмом), `suggest`→MAY. Письма без `compliance`: `directive`→MUST, `idea`→SHOULD.

Формат исходящего письма `mailbox/to-brain/YYYY-MM-DD-slug.md`:

```yaml
---
from: DKMalmyzh
to: brain
date: YYYY-MM-DD
topic: ...
kind: idea | question | feedback | report
compliance: suggest | recommend | mandate   # для kind=idea
urgency: low | normal | high
---
```

## Гейты и деплой

- Гейты (`lint` + `typecheck` + `build`) гоняет **CI на GitHub Actions** — `.github/workflows/ci.yml`, на каждый PR и push в `main`; Postgres там эфемерный, сервис-контейнер. Локально `corepack pnpm build` **не** обязателен (ему нужен живой Postgres) — достаточно `lint`/`typecheck`, остальное подтверждает зелёный CI на PR.
- Мерж в `main` → **авто-деплой на прод** (`deploy-prod.yml`). ⚠️ У воркфлоу `paths-ignore`: `docs/**`, `**.md`, `.github/**`, `.claude/**` — эти файлы деплой **не** триггерят.
- Миграции схемы Payload — **вручную ДО деплоя** через `apply-migration.yml` (workflow_dispatch, migration-guard #017), затем деплой через dispatch.

## Git и совместная работа нескольких агентов

- `main` защищён логически: ветка → коммит → push → PR → squash merge. **Прямых пушей в `main` нет**; `--force` и `reset --hard` по `main` запрещены.
- Один агент — одна задача — своя ветка. При одновременной работе пишущих агентов — отдельный `git worktree` на каждого; двух пишущих агентов в одном рабочем дереве не запускать.
- Перед правкой проверяй `git status`. Незнакомые изменения считай чужими: не удаляй, не форматируй попутно, не включай в свой коммит и не прячь в stash.
- Не переключай ветку в рабочем дереве, которое может использовать другой агент.
- Объявляй границы файлов/задачи в описании PR. Пересеклись — второй агент ждёт merge первого и обновляет свою ветку до начала правок.
- Один PR — одна задача. Коммиты — Conventional Commits.
- После обрыва сначала восстанавливай фактическое состояние из Git/PR, не повторяй действия по памяти (`.claude/commands/obriv.md`).

Межмодельная память — только Git: чат одной модели **не** источник истины для другой. Долговечные решения живут в документации/ADR, состояние незавершённой работы — в `docs/SESSION_HANDOFF.md`, история — в коммитах и PR, диалог с Мозгом — в `mailbox/`.

## Какие AI-файлы хранить в Git

Коммитить:

- `AGENTS.md` — общие правила и источник истины;
- `CLAUDE.md`, `GEMINI.md` — короткие адаптеры к `AGENTS.md`;
- `.claude/commands/` и `.claude/settings.json` — общие безопасные команды/ограничения;
- `docs/SESSION_HANDOFF.md`, проектную документацию и `mailbox/`.

Не коммитить:

- локальные разрешения и персональные настройки (`.claude/settings.local.json`);
- кэши/сессии `.codex/`, `.gemini/` и временные планы вне проектной документации;
- `.env*`, ключи, токены, логи и временные файлы.

Секреты не должны жить в репозитории даже под защитой `.gitignore`.
