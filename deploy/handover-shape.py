#!/usr/bin/env python3
"""Разбор json-файлов выгрузки: структура без значений либо число записей.

Зачем отдельным файлом, а не строкой внутри команды: скрипт едет на бокс по scp и
запускается там (D-046 — текст файлом, команде отдаётся путь). Инлайн-heredoc внутри
удалённого heredoc ломается на отступах YAML, а python к отступам чувствителен.

Зачем без значений: файлы содержат чужие новости, а лог прогона публичный (D-038).

Два режима:
  handover-shape.py <файл>            — структура: ключи, типы, счётчики
  handover-shape.py --count <файл>    — только число записей, с падением на
                                        нераспознанной форме
"""

import json
import sys

# Ключи, под которыми выгрузка может прятать массив записей. Форма может смениться
# в следующем снимке, и тогда честнее упасть, чем напечатать число ключей обёртки
# как число записей.
LIST_KEYS = ('items', 'rows', 'data', 'records', 'posts')

# Ключ словаря печатается как есть только когда он заведомо служебный. Ключом может
# оказаться заголовок или slug чужой новости, а обещание файла — «без значений».
SAFE_KEY_CHARS = set('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-.')


def safe_key(key):
    text = str(key)
    if len(text) <= 40 and set(text) <= SAFE_KEY_CHARS:
        return text
    return 'ключ(%d симв.)' % len(text)


def shape(value, depth=0):
    if isinstance(value, dict):
        if depth >= 2:
            return 'объект(%d полей)' % len(value)
        return {safe_key(k): shape(v, depth + 1) for k, v in value.items()}
    if isinstance(value, list):
        if not value:
            return 'пустой список'
        return 'список(%d) из %s' % (len(value), type(value[0]).__name__)
    if isinstance(value, str):
        return 'строка(%d симв.)' % len(value)
    if value is None:
        return 'null'
    return type(value).__name__


def collect_flags(value, counts, prefix=''):
    """Считает булевы поля по всему дереву: путь -> [сколько True, сколько всего]."""
    if isinstance(value, dict):
        for key, item in value.items():
            collect_flags(item, counts, prefix + ('.' if prefix else '') + safe_key(key))
    elif isinstance(value, list):
        for item in value:
            collect_flags(item, counts, prefix)
    elif isinstance(value, bool):
        slot = counts.setdefault(prefix, [0, 0])
        slot[1] += 1
        if value:
            slot[0] += 1


def count_records(data):
    """Число записей либо None, если форма не распознана."""
    if isinstance(data, list):
        return len(data)
    if isinstance(data, dict):
        for key in LIST_KEYS:
            if isinstance(data.get(key), list):
                return len(data[key])
        lists = [v for v in data.values() if isinstance(v, list)]
        if len(lists) == 1:
            return len(lists[0])
    return None


def main():
    args = sys.argv[1:]
    count_only = False
    if args and args[0] == '--count':
        count_only = True
        args = args[1:]
    if not args:
        print('нужен путь к json-файлу', file=sys.stderr)
        return 2

    path = args[0]
    # Ошибки НЕ гасим: причина сбоя обязана быть видна в логе, иначе «записей ?»
    # выглядит как результат.
    with open(path, encoding='utf-8') as handle:
        data = json.load(handle)

    if count_only:
        n = count_records(data)
        if n is None:
            print('форма файла не распознана: %s верхнего уровня' % type(data).__name__)
            return 1
        print('записей %d' % n)
        return 0

    items = data.items() if isinstance(data, dict) else enumerate(data)
    for key, value in items:
        print('  %s: %s' % (safe_key(key) if isinstance(data, dict) else key, shape(value)))

    counts = {}
    collect_flags(data, counts)
    if counts:
        print('  --- булевы признаки (сколько True из скольких):')
        for path_key in sorted(counts):
            true_count, total = counts[path_key]
            print('  %s: %d из %d' % (path_key, true_count, total))
    return 0


if __name__ == '__main__':
    sys.exit(main())
