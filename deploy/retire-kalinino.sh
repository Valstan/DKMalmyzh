#!/usr/bin/env bash
# Снять Калинино с бокса (D-089, письмо Мозга 12.09). Исполняется на боксе,
# приезжает файлом (D-046). MODE=check — только отчёт; MODE=retire — снятие.
#
# Что снимается: kalinino.service (Next-процесс на :3006), kalinino-vk-sync.timer
# и его .service (ключ шлюза отозван 06.09 — таймер ежесуточно падает в failed),
# юнит-файлы. Каталог НЕ удаляется — переименовывается: репо KalininoCKS ещё не
# заархивировано (D-081). nginx не трогается: redirect-vhost — наш и остаётся.
set -euo pipefail

MODE="${MODE:-check}"
KDIR=/home/valstan/kalinino
RETIRED=/home/valstan/kalinino.retired-2026-09-12
UNITS="kalinino-vk-sync.timer kalinino.service kalinino-vk-sync.service"

report() {
  echo "== юниты kalinino* (list-units --all):"
  systemctl list-units --all --no-legend 'kalinino*' || true
  echo "== таймеры kalinino* (list-timers --all):"
  systemctl list-timers --all --no-legend 'kalinino*' || true
  echo "== unit-файлы kalinino*:"
  systemctl list-unit-files --no-legend 'kalinino*' || true
  echo "== слушает :3006 (ss -tlnp, без заголовка):"
  sudo ss -tlnp 'sport = :3006' | tail -n +2 || true
  echo "== каталоги:"
  [ -d "$KDIR" ] && echo "  $KDIR — есть" || echo "  $KDIR — нет"
  [ -d "$RETIRED" ] && echo "  $RETIRED — есть" || echo "  $RETIRED — нет"
  echo "== free -m: $(free -m | sed -n 2p | tr -s ' ')"
}

echo "### состояние до"
report

if [ "$MODE" != "retire" ]; then
  echo "режим check — изменений нет"
  exit 0
fi

echo "### снятие"
# Сначала таймер — чтобы не стартанул посреди работы.
for u in $UNITS; do
  if [ -n "$(systemctl list-unit-files --no-legend "$u" 2>/dev/null)" ]; then
    echo "disable --now $u"
    sudo systemctl disable --now "$u" || true
    sudo systemctl reset-failed "$u" 2>/dev/null || true
  else
    echo "$u — unit-файла нет, пропуск"
  fi
done

REMOVED=0
for f in /etc/systemd/system/kalinino*.service /etc/systemd/system/kalinino*.timer; do
  [ -e "$f" ] || continue
  echo "rm $f"
  sudo rm -f "$f"
  REMOVED=$((REMOVED + 1))
done
echo "unit-файлов убрано: $REMOVED"
sudo systemctl daemon-reload
sudo systemctl reset-failed || true

if [ -d "$KDIR" ]; then
  if [ -e "$RETIRED" ]; then
    echo "::error::$RETIRED уже существует — переименование не выполнено, разбирать руками"
    exit 1
  fi
  sudo mv "$KDIR" "$RETIRED"
  echo "каталог переименован → $RETIRED"
else
  echo "каталога $KDIR нет — переименовывать нечего"
fi

sleep 3
echo "### состояние после"
report

# Приёмка — условия выхода, не украшение: каждое «пусто» проверяется по факту.
FAIL=0
[ -z "$(systemctl list-units --all --no-legend 'kalinino*')" ] || { echo "::error::юниты kalinino* ещё числятся"; FAIL=1; }
[ -z "$(systemctl list-timers --all --no-legend 'kalinino*')" ] || { echo "::error::таймеры kalinino* ещё числятся"; FAIL=1; }
[ -z "$(sudo ss -tlnp 'sport = :3006' | tail -n +2)" ] || { echo "::error::порт 3006 всё ещё слушается"; FAIL=1; }
[ ! -d "$KDIR" ] || { echo "::error::каталог $KDIR всё ещё на месте"; FAIL=1; }
# `if`, не `[ … ] && echo` (G347): ложный тест последней командой отдаёт 1 под set -e.
if [ "$FAIL" = 0 ]; then echo "приёмка: юнитов нет, таймеров нет, :3006 пуст, каталог переименован"; fi
exit "$FAIL"
