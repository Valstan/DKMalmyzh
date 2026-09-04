#!/usr/bin/env python3
"""Печатает СТРУКТУРУ json-файла выгрузки: ключи, типы, счётчики — без значений.

Зачем отдельным файлом, а не строкой внутри команды: скрипт едет на бокс по scp и
запускается там (D-046 — текст файлом, команде отдаётся путь). Инлайн-heredoc внутри
удалённого heredoc ломается на отступах YAML, а python к отступам чувствителен.

Зачем без значений: файл содержит чужие новости, а лог прогона публичный (D-038).
Задача — ответить на один вопрос: правда ли ручных правок нет, или файл их несёт.
"""

import json
import sys


def shape(value, depth=0):
    if isinstance(value, dict):
        if depth >= 2:
            return 'объект(%d полей)' % len(value)
        return {key: shape(item, depth + 1) for key, item in value.items()}
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
    """Считает булевы поля по всему дереву: путь -> [сколько True, сколько всего].

    Именно счётчики отвечают на вопрос «правки есть или нет», не раскрывая текстов.
    """
    if isinstance(value, dict):
        for key, item in value.items():
            collect_flags(item, counts, prefix + ('.' if prefix else '') + str(key))
    elif isinstance(value, list):
        for item in value:
            collect_flags(item, counts, prefix)
    elif isinstance(value, bool):
        slot = counts.setdefault(prefix, [0, 0])
        slot[1] += 1
        if value:
            slot[0] += 1


def main():
    if len(sys.argv) < 2:
        print('нужен путь к json-файлу', file=sys.stderr)
        return 2
    with open(sys.argv[1], encoding='utf-8') as handle:
        data = json.load(handle)
    items = data.items() if isinstance(data, dict) else enumerate(data)
    for key, value in items:
        print('  %s: %s' % (key, shape(value)))

    counts = {}
    collect_flags(data, counts)
    if counts:
        print('  --- булевы признаки (сколько True из скольких):')
        for path in sorted(counts):
            true_count, total = counts[path]
            print('  %s: %d из %d' % (path, true_count, total))
    return 0


if __name__ == '__main__':
    sys.exit(main())
