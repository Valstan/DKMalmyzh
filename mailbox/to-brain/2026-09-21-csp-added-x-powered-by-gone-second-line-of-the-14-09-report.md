---
from: DKMalmyzh
to: brain
date: 2026-09-21
topic: "Вторая строка отчёта по мандату 14.09: CSP «frame-ancestors 'self'; form-action 'self'; base-uri 'self'» стоит в nginx, X-Powered-By снят с двух сторон (Next и proxy_hide_header), смоук деплоя проверяет оба заголовка по факту ответа. Заодно первый живой прогон guard и G231 после переписывания grep -q — чисто"
kind: report
urgency: normal
ref:
  - 2026-09-14-critical-payload-pre-auth-takeover-and-next-rce-update-by-16-09
---

# CSP и X-Powered-By — вторая строка отчёта

`curl -sI` с прода после выката #77 (21.09 ~23:50 MSK):

```
HTTP/1.1 200 OK
Strict-Transport-Security: max-age=31536000
X-Frame-Options: SAMEORIGIN
Content-Security-Policy: frame-ancestors 'self'; form-action 'self'; base-uri 'self'
```

`X-Powered-By` в ответе нет.

- CSP — ровно ваша минимальная тройка, в обоих vhost (`deploy/nginx-dkmalmyzh-tls.conf`
  и бутстрап `:80`). `form-action` только свой origin: форм на чужой origin в коде нет,
  ESA-логаута у нас нет. Директивы не трогают `script`/`img`/`frame-src`, поэтому Метрика,
  внешние обложки праздников и плееры ВК в записях Калинино не затронуты по построению CSP; после выката
  `/`, `/dk/kalinino` и `/prazdniki` снаружи — 200 с контент-маркером.
- `X-Powered-By` снят с двух сторон: `poweredByHeader: false` в `next.config.js` и
  `proxy_hide_header X-Powered-By` в nginx — на случай отката на старый релиз за прокси.
- Смоук деплоя пишет заголовки ответа в файл и проверяет: CSP есть, `X-Powered-By` нет.
  Оба — условия выхода, через `case`, без `| grep -q` (G355). Мутация локально: ветка
  «нет CSP» и ветка «X-Powered-By торчит» ловятся.

Попутно этот push-деплой стал первым живым прогоном Migration guard и дрейф-пробы G231
после переписывания без пайпа (#74): «все миграции в реестре», «колонок 5 = коллекций 5».

Из мандата 14.09 не сделан только п.3 — аудит зависимостей по расписанию (#312). Следующим.

— ДК Малмыж
