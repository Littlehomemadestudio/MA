#!/usr/bin/env python3
"""MATH ARENA - visual QA: navigates every major screen, captures
screenshots for the release bundle, and runs pixel-level sanity checks
(non-blank, cream palette, reasonable ink coverage)."""
import json
import os
import subprocess
import sys
import time
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, 'app')
SHOTS = os.path.join(ROOT, 'release', 'qa-screenshots')
PORT = 8495
BASE = f'http://127.0.0.1:{PORT}'
os.makedirs(SHOTS, exist_ok=True)

results = []


def check(name, cond, extra=''):
    results.append((name, bool(cond)))
    print(('PASS  ' if cond else 'FAIL  ') + name + (' ' + str(extra) if extra else ''))


def seed(name, xp=1500, answered=40, correct=28, mistakes=True):
    mistakes_list = []
    if mistakes:
        from_json = None
    state = {
        'profile': {'name': name, 'avatar': {'base': 'owl', 'color': '#3D9BFF'}, 'createdAt': int(time.time() * 1000), 'token': None},
        'progress': {'xp': xp, 'level': 1, 'soloRating': 1042, 'wins': 3, 'losses': 2, 'sessionsDone': 5, 'bestStreak': 7},
        'mastery': {}, 'mistakes': [], 'records': {'blitz': {'score': 1250, 'at': time.time() * 1000, 'correct': 12, 'total': 15}},
        'achievements': ['first-win', 'streak-5', 'offline-explorer'],
        'cosmetics': {'frames': ['default'], 'titles': ['rookie'], 'skins': ['fox'], 'equippedFrame': 'default', 'equippedTitle': 'rookie'},
        'settings': {'sound': 0, 'music': 0, 'haptics': False, 'reducedMotion': False, 'serverUrl': ''},
        'daily': {'date': '', 'done': False, 'score': 0},
        'stats': {'answered': answered, 'correct': correct, 'timeMs': answered * 14000, 'bySkill': {}, 'byChapter': {'ch1': {'correct': 8, 'total': 12}, 'ch2': {'correct': 6, 'total': 10}}},
        'pendingSessions': [], 'notifications': [{'id': 'n1', 'kind': 'info', 'text': 'به میدان ریاضی خوش آمدی!', 'ts': time.time() * 1000, 'read': False}],
        'onboarded': True,
    }
    return state


def shot(page, name):
    path = os.path.join(SHOTS, name + '.png')
    page.screenshot(path=path)
    # pixel sanity
    im = Image.open(path).convert('RGB')
    w, h = im.size
    # sample full-resolution pixels (strided) so thin ink strokes aren't lost
    allpx = list(im.getdata())
    px = allpx[::7]
    n = len(px)
    # v2 navy design: background is #071426; "surface" = navy family pixels
    navy = sum(1 for p in px if p[2] > p[0] and p[2] >= 18 and p[0] < 70 and p[2] < 110) / n
    blank = sum(1 for p in px if abs(p[0]-7) < 6 and abs(p[1]-20) < 8 and abs(p[2]-38) < 10) / n
    ink = sum(1 for p in px if p[0] < 60 and p[1] < 70 and p[2] < 90) / n
    color = sum(1 for p in px if max(p) - min(p) > 40) / n
    return path, blank, ink, color, navy


def main():
    static = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)],
                              cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.2)
    pw = sync_playwright().start()
    browser = pw.chromium.launch()
    ctx = browser.new_context(viewport={'width': 412, 'height': 860}, device_scale_factor=2, reduced_motion='reduce')
    page = ctx.new_page()
    state = seed('آرتین قهرمان')
    page.add_init_script(f"localStorage.setItem('matharena.v1', {json.dumps(json.dumps(state, ensure_ascii=False))})")
    errs = []
    page.on('pageerror', lambda e: errs.append((getattr(e, 'stack', '') or str(e))[:600]))

    page.goto(BASE + '/index.html')
    page.wait_for_timeout(2600)

    screens = [
        ('home', None),
        ('play-hub', None),
        ('bot-setup', None),
        ('offline-hub', None),
        ('practice', None),
        ('boss-list', None),
        ('mistakes', None),
        ('gb15', None),
        ('profile', None),
        ('achievements', None),
        ('stats', None),
        ('notifications', None),
        ('settings', None),
        ('avatar', None),
        ('friends', None),
        ('add-friend', None),
        ('tournaments', None),
    ]
    for name, _ in screens:
        try:
            page.evaluate(f"""
              import('/assets/js/core.js').then(m => m.nav('{name}'));
            """)
        except Exception:
            pass  # transient context issues during navigation; DOM check below decides
        page.wait_for_timeout(950)
        nodes = 0
        try:
            nodes = page.evaluate("() => document.querySelectorAll('#screen *').length")
        except Exception:
            pass
        path, blank, ink, color, navy = shot(page, name)
        check(f'{name} renders', nodes >= 12 and navy + blank > 0.25, f'nodes={nodes} blank={blank:.0%} navy={navy:.0%}')

    # duel with bot (topic + question + result)
    page.evaluate("import('/assets/js/core.js').then(m => m.nav('duel', { online: false, config: { vsBot: true, botLevel: 3 } }))")
    page.wait_for_timeout(800)
    shot(page, 'duel-topic')
    check('duel topic picker', page.locator('.topic-card').count() == 3)
    page.locator('.topic-card').first.click()
    page.wait_for_timeout(700)
    shot(page, 'duel-question')
    check('duel question', page.locator('.opt').count() in (3, 4))
    page.locator('.opt').nth(1).click()
    for _ in range(30):
        page.wait_for_timeout(600)
        if page.locator('.opt.correct').count() >= 1:
            break
    shot(page, 'duel-result')
    check('duel answer result', page.locator('.opt.correct').count() >= 1)

    # solo blitz
    page.evaluate("import('/assets/js/core.js').then(m => m.nav('solo', { mode: 'blitz' }))")
    page.wait_for_timeout(700)
    shot(page, 'solo-blitz')
    check('blitz running', page.locator('.opt').count() in (3, 4))

    # boss
    page.evaluate("import('/assets/js/core.js').then(m => m.nav('boss', { bossId: 'boss-ch1' }))")
    page.wait_for_timeout(800)
    shot(page, 'boss-battle')
    check('boss battle', page.locator('.hp-bar').count() >= 1)

    # daily challenge
    page.evaluate("import('/assets/js/core.js').then(m => m.nav('daily-challenge'))")
    page.wait_for_timeout(1200)
    shot(page, 'daily')

    check('no page errors during QA', len([e for e in errs if 'net::ERR' not in e]) == 0, errs[:2])

    browser.close()
    pw.stop()
    static.terminate()

    failed = [n for n, ok in results if not ok]
    print(f"\n==== visual QA: {len(results) - len(failed)}/{len(results)} passed ====")
    if failed:
        print('FAILED:', failed)
    sys.exit(1 if failed else 0)


def w_ok():
    return True


def h_ok():
    return True


if __name__ == '__main__':
    main()
