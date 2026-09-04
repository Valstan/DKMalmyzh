#!/usr/bin/env bash
# Запуск импорта из ВК по таймеру. Ставится деплоем в /usr/local/bin.
#
# Зачем обёртка вместо `curl --fail` прямо в ExecStart:
#
# 1. `--fail` подавляет тело ответа при HTTP-ошибке. Маршрут отвечает осмысленно
#    («служебная операция уже идёт», «SARAFAN_GATEWAY_URL/KEY не заданы»), но в
#    журнал попадал только `curl: (22) The requested URL returned error: 409` —
#    отказ без причины, неотличимый от выключенного маршрута.
# 2. 409 — не отказ. Замок маршрута отвергает второй прогон поверх идущего; это
#    штатная работа, а не поломка, и юнит не должен из-за неё уходить в failed:
#    иначе `systemctl --failed` перестаёт значить «что-то сломалось».
# 3. Приложение может ещё подниматься (после ребута или деплоя). Отказ соединения
#    лечится ожиданием, а не тревогой, поэтому есть короткий ретрай.
#
# Секрет читается из окружения юнита (EnvironmentFile), в аргументы не попадает.

set -uo pipefail

URL="http://127.0.0.1:3005/internal/vk-sync"
BODY=$(mktemp)
trap 'rm -f "$BODY"' EXIT INT TERM

if [ -z "${INTERNAL_OPS_SECRET:-}" ]; then
  echo "INTERNAL_OPS_SECRET не задан — служебные маршруты выключены, импорт пропущен"
  exit 0
fi

# --retry-connrefused: после ребута таймер может сработать раньше, чем приложение
# начнёт слушать порт. Это ожидание, а не отказ.
code=$(curl --silent --show-error --output "$BODY" --write-out '%{http_code}' \
  --max-time 1500 --retry 3 --retry-delay 10 --retry-connrefused \
  -X POST -H "x-internal-secret: ${INTERNAL_OPS_SECRET}" "$URL") || code="000"

echo "POST /internal/vk-sync -> HTTP $code"
head -c 2000 "$BODY"
echo

case "$code" in
  200) exit 0 ;;
  409) echo "прогон уже идёт — этот запуск пропущен, это норма"; exit 0 ;;
  503) echo "маршрут выключен (нет ключа шлюза или секрета) — импорт не настроен"; exit 0 ;;
  *) echo "импорт не выполнен: HTTP $code"; exit 1 ;;
esac
