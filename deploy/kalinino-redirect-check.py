#!/usr/bin/env python3
"""Приёмка редиректов Калинино (D-074): каждый опубликованный slug из posts.json
через прежнее имя обязан дать 301 на портал и затем 200 у нас.

Едет на бокс по scp и запускается там (D-046). Печатает только числа и slug'и
расхождений — без путей и без хоста. Ноль расхождений — условие строки
«редирект стоит», а не цель.

Аргументы: <posts.json> <старое имя (punycode)> <имя портала (punycode)>
"""

import json
import ssl
import sys
import urllib.parse
import urllib.request

# Всё ходит на 127.0.0.1 с нужным Host: имя может ещё не указывать на бокс с
# точки зрения этой машины, а проверяется конфиг nginx, а не DNS.
LOCAL = '127.0.0.1'


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request(host, path, expect_redirect):
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    url = 'https://%s%s' % (LOCAL, path)
    req = urllib.request.Request(url, headers={'Host': host}, method='GET')
    opener = urllib.request.build_opener(NoRedirect, urllib.request.HTTPSHandler(context=ctx))
    try:
        with opener.open(req, timeout=20) as resp:
            return resp.status, resp.headers.get('Location', '')
    except urllib.error.HTTPError as err:
        return err.code, err.headers.get('Location', '')
    except Exception as err:  # noqa: BLE001 — любой сбой соединения = расхождение
        return 0, str(err.__class__.__name__)


def main():
    if len(sys.argv) != 4:
        print('нужны: posts.json старое_имя имя_портала', file=sys.stderr)
        return 2
    posts_path, old_host, new_host = sys.argv[1:4]
    with open(posts_path, encoding='utf-8') as handle:
        posts = json.load(handle)
    slugs = sorted({p['slug'] for p in posts if p.get('status') == 'published' and p.get('slug')})
    print('опубликованных slug в выгрузке: %d' % len(slugs))

    bad = []
    for slug in slugs:
        path = '/news/' + urllib.parse.quote(slug, safe='')
        code, location = request(old_host, path, True)
        want = 'https://%s%s' % (new_host, path)
        if code != 301 or location != want:
            bad.append('%s: старое имя → %s %s' % (slug, code, 'не туда' if code == 301 else ''))
            continue
        code2, _ = request(new_host, path, False)
        if code2 != 200:
            bad.append('%s: портал → %s' % (slug, code2))

    root_code, root_loc = request(old_host, '/', True)
    if root_code != 301 or not root_loc.endswith('/dk/kalinino'):
        bad.append('/: %s %s' % (root_code, root_loc[-40:]))

    print('проверено: %d, расхождений: %d' % (len(slugs), len(bad)))
    for line in bad:
        print('  ' + line)
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
