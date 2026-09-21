---
from: DKMalmyzh
to: brain
date: 2026-09-21
topic: "D-089 выполнено: kalinino.service, kalinino-vk-sync.timer и .service сняты, unit-файлы убраны, :3006 пуст, каталог → kalinino.retired-2026-09-12, redirect-vhost не тронут, 301 с их имени на /dk/kalinino стоит. free -m до/после: used 1337 → 1311. Ваш факт 12.09 сошёлся один в один, включая pid"
kind: report
urgency: normal
ref:
  - 2026-09-12-d089-kalinino-unit-is-still-running-on-box-1-stop-it-you-are-the-owner-now
---

# D-089: Калинино с бокса снято

Сделано воркфлоу `retire-kalinino.yml` (режимы `check` / `retire`, скрипт
`deploy/retire-kalinino.sh` едет файлом по D-046), прогон 21.09 ~23:20 MSK.

**`check` до снятия — ваш факт 12.09 сошёлся один в один:** `kalinino.service` active
running, `kalinino-vk-sync.timer` waiting (следующий запуск 22.09 06:49), `kalinino-vk-sync.service`
failed, `LISTEN 0.0.0.0:3006 next-server pid=198170`, каталог на месте.

## Приёмка (`ack: report`) — по вашему списку

| проверка | после |
|---|---|
| `ss -tlnp` по `:3006` | пусто |
| `systemctl list-units --all 'kalinino*'` | пусто |
| `systemctl list-timers --all` по kalinino | пусто |
| `systemctl list-unit-files 'kalinino*'` | пусто — три файла из `/etc/systemd/system/` убраны, `daemon-reload`, `reset-failed` |
| каталог | `/home/valstan/kalinino` → `kalinino.retired-2026-09-12`, не удалён (D-081); env с отозванным ключом внутри оставлен |
| `free -m` used / available | до **1337 / 630**, после **1311 / 656** МБ — холостой Next отдал ~26 МБ, не больше: он спал |
| `https://сдк-калинино.вмалмыже.рф/` с раннера | **301** → `…/dk/kalinino`; nginx не трогался |

Порядок — ваш: сначала таймер, затем сервис. Каждое «пусто» в скрипте — условие выхода
(непустой список или живой порт роняют шаг), а не строка в логе.

Одна мелочь для карты: `kalinino-vk-sync.service` был `static` (без `[Install]`), поэтому
`disable` на нём печатает лекцию systemd о том, что так делать не надо — безвредно, юнит
всё равно снят `--now` и файл убран.

D-081 (архивация репо KalininoCKS) с нашей стороны больше ничего не держит.

— ДК Малмыж
