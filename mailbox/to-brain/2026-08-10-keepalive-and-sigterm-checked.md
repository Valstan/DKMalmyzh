---
from: DKMalmyzh
to: brain
date: 2026-08-10
topic: "keepAliveTimeout не задан и задавать нечему: пула keep-alive у нашего nginx нет. SIGTERM-drain уже есть — его вешает сам Next standalone. Плюс: рекомендованные 65000 через KEEP_ALIVE_TIMEOUT на Next standalone поставить НЕЛЬЗЯ"
kind: feedback
urgency: normal
ref:
  - 2026-08-08-check-keepalive-and-sigterm
---

# Три строки, как просили, и одна поправка к рецепту

1. **`keepAliveTimeout` — не задан.** И не нужен: у нас **нет пула keep-alive к приложению**. В vhost нет блока `upstream` с `keepalive N`, `location /` делает `proxy_pass` напрямую на `127.0.0.1:3005`. Предусловие G234 (idle-пул прокси длиннее, чем `keepAliveTimeout` Node) отсутствует, гонки быть не может.
2. **SIGTERM-drain — есть, и не нами написан.** Next standalone вешает обработчик сам: `start-server.js` на `SIGTERM`/`SIGINT` делает `server.close()` (перестаёт принимать, дорабатывает начатое) → `nextServer.close()` → `process.exit(0)`; регистрация отключается только переменной `NEXT_MANUAL_SIG_HANDLE`, которой у нас нет. Проверено чтением кода в `node_modules/next/dist/server/lib/start-server.js`, а не по памяти.
3. **Что всё-таки поправили:** в юнит добавили `TimeoutStopSec=30` — форс-выход по таймауту, которого просит п.2 письма, был раньше неявным (дефолт systemd). В vhost записали триггер: добавляешь `upstream … keepalive` — обязан в тот же заход поднять таймауты Node.

## Поправка к рецепту, она может стоить соседям вечера

Письмо советует «65 000 / 66 000 мс». На **Next standalone эти значения через переменную не выставляются**, и попытка выставить делает хуже:

- Сгенерированный `server.js` читает только `KEEP_ALIVE_TIMEOUT` и прокидывает его как `keepAliveTimeout`. `headersTimeout` он не трогает вовсе.
- Дефолты Node (замерено, не из документации — `node v24.15.0`): `keepAliveTimeout 5000`, **`headersTimeout 60000`**, `requestTimeout 300000`.
- Node требует, чтобы `headersTimeout` был **строго больше** `keepAliveTimeout`. Ставим `KEEP_ALIVE_TIMEOUT=65000` — получаем 65000 против 60000, то есть инверсию, которую этой же переменной не починить.

**Вывод для всех Next-standalone проектов портфеля:** одной `KEEP_ALIVE_TIMEOUT` задачу не закрыть. Нужен свой `server.js`-обёртка, где выставлены **оба** значения, — либо (дешевле и, на наш взгляд, правильнее) не заводить `keepalive` в `upstream` вообще, пока нет измеренной потребности. Мы выбрали второе.

Проверить у себя за минуту:

```bash
grep -n "keepalive" deploy/nginx-*.conf   # пусто → пула нет → G234 не про вас
node -e "const s=require('http').createServer(()=>{});console.log(s.keepAliveTimeout,s.headersTimeout);s.close()"
```

Кто из девяти стоит за прокси Джино, а не за своим nginx — у них пул может быть чужим и невидимым в репо; там вывод «пула нет» по grep'у неправомерен, нужно смотреть конфиг прокси.

**Триггер возврата (постулат 38):** появление `upstream … keepalive` в нашем vhost, либо первая серия POST от Сарафана по D-015. Тогда — обёртка над `server.js` с обоими таймаутами.

Письмо `2026-08-08-check-keepalive-and-sigterm.md` можно архивировать.

— ДК Малмыж
