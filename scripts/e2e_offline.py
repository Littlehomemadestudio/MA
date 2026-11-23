#!/usr/bin/env python3
"""MATH ARENA - E2E test harness (Scenarios A + D + visual QA).

Runs the app in headless Chromium against a static file server
(and optionally the live backend for online checks), drives the
critical user journeys, captures screenshots, and verifies offline
persistence across restarts.
"""
import json
import os
import subprocess
import sys
import time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, 'app')
SHOTS = os.environ.get('MA_SHOTS', '/tmp/ma-shots')
HTTP_PORT = 8490
BASE = f'http://127.0.0.1:{HTTP_PORT}'

os.makedirs(SHOTS, exist_ok=True)
results = []


def check(name, cond, extra=''):
    results.append((name, bool(cond)))
    print(('PASS  ' if cond else 'FAIL  ') + name + (' ' + str(extra) if extra else ''))


def start_static():
    proc = subprocess.Popen([sys.executable, '-m', 'http.server', str(HTTP_PORT)],
                            cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.2)
    return proc


def shot(page, name):
    page.screenshot(path=os.path.join(SHOTS, name + '.png'))


def dismiss_modals(page):
    # close any achievement / info modal that popped up
    for _ in range(4):
        btn = page.locator('.modal .btn')
        if btn.count() and page.locator('.modal-back').count():
            btn.first.click()
            page.wait_for_timeout(250)
        else:
            break


def console_errors(page):
    errs = []
    page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errs.append(str(e) + ' || STACK: ' + (getattr(e, 'stack', '') or '')[:500]))
    return errs


def main():
    static = start_static()
    pw = sync_playwright().start()
    browser = pw.chromium.launch()
    ctx = browser.new_context(viewport={'width': 412, 'height': 860}, device_scale_factor=2)
    page = ctx.new_page()
    errs = console_errors(page)

    # ---------------- splash -> onboarding ----------------
    page.goto(BASE + '/index.html')
    page.wait_for_timeout(2600)
    shot(page, '01-splash')
    check('splash loads', page.locator('.splash').count() > 0 or page.locator('.screen').count() > 0)

    # onboarding: welcome -> name -> avatar
    if page.locator('text=به میدان ریاضی خوش آمدی').count():
        page.click('button:has-text("شروع کنیم")')
        page.wait_for_timeout(400)
        shot(page, '02-onboarding-name')
        page.fill('input', 'آرتین تست')
        page.click('button:has-text("بعدی")')
        page.wait_for_timeout(400)
        shot(page, '03-onboarding-avatar')
        page.click('.avatar-pick >> nth=2')
        page.click('.color-dot >> nth=3')
        page.click('button:has-text("ورود به میدان")')
        page.wait_for_timeout(1400)
    shot(page, '04-home')

    check('reached home', page.locator('.hero').count() > 0)
    check('hub head shows player', page.locator('.hub-head').count() > 0)
    check('daily challenge card', page.locator('text=چالش روزانه').count() > 0)
    check('live games section', page.locator('text=بازی‌های زنده').count() > 0)
    check('bottom nav 5 tabs', page.locator('.nav button').count() == 5)
    check('offline banner shown', page.locator('.conn-banner').count() > 0)

    # ---------------- practice path -> chapter -> solo game (offline) ----------
    page.click('text=مسیر تمرین')
    page.wait_for_timeout(700)
    shot(page, '05-practice-path')
    check('practice path lists chapters', page.locator('.scroll .panel').count() >= 7)

    page.click('text=فصل ۱:')
    page.wait_for_timeout(600)
    shot(page, '06-chapter-detail')
    check('chapter detail nodes', page.locator('.path-node').count() >= 5)

    # start the concept node (first unlocked node for a fresh player)
    page.click('.path-node >> nth=0')
    page.wait_for_timeout(800)
    shot(page, '07-solo-question')
    check('solo question rendered', page.locator('.opt').count() in (3, 4))
    check('timer ring present', page.locator('.timer-ring').count() == 1)

    # answer several questions (some wrong intentionally)
    answered = 0
    wrong_seen = False
    for i in range(8):
        page.wait_for_selector('.opt:not([disabled])', timeout=15000)
        opts = page.locator('.opt:not([disabled])')
        if opts.count() == 0:
            break
        # choose option 2 for question 3 (likely wrong sometimes), else option 1
        pick = 1 if i != 3 else 2
        opts.nth(pick).click()
        answered += 1
        # check feedback appeared (correct/wrong class)
        page.wait_for_timeout(300)
        if page.locator('.opt.wrong').count():
            wrong_seen = True
        page.wait_for_timeout(1300)
        if page.locator('.result-hero').count():
            break
    check('answered questions in solo run', answered >= 3, f'answered={answered}')
    check('mistake feedback observed', wrong_seen)

    # finish the run: keep answering until results or use the timeout
    for i in range(40):
        if page.locator('.result-hero').count():
            break
        dismiss_modals(page)
        opts = page.locator('.opt:not([disabled])')
        if opts.count() == 0:
            page.wait_for_timeout(500)
            continue
        opts.first.click()
        page.wait_for_timeout(1450)
    shot(page, '08-results')
    check('results screen reached', page.locator('.verdict').count() > 0)
    check('xp awarded on results', page.locator('text=XP').count() > 0)

    # ---------------- mistake notebook ----------------
    dismiss_modals(page)
    page.click('button:has-text("بازگشت به خانه")')
    page.wait_for_timeout(600)
    page.goto(BASE + '/index.html#mistakes')
    page.evaluate("location.reload()")
    page.wait_for_timeout(2500)
    # navigate via UI instead: home -> mistake notebook through quick grid
    page.click('text=دفتر اشتباهات')
    page.wait_for_timeout(700)
    shot(page, '09-mistakes')
    check('mistake notebook opens', page.locator('.mistake-item').count() > 0 or page.locator('text=اشتباه').count() > 0)
    check('solution shown in notebook', page.locator('.solution-sheet').count() > 0)

    # ---------------- GB15 ----------------
    page.click('.nav button >> nth=0')
    page.wait_for_timeout(500)
    page.click('text=بهتر شو در ۱۵')
    page.wait_for_timeout(700)
    shot(page, '10-gb15')
    check('gb15 starts (diagnostic)', page.locator('text=تشخیص').count() > 0)
    # answer diagnostic questions
    for i in range(6):
        opts = page.locator('.opt:not([disabled])')
        if opts.count() == 0:
            break
        opts.first.click()
        page.wait_for_timeout(1900)
    page.wait_for_timeout(800)
    shot(page, '11-gb15-practice')
    check('gb15 progressed past diagnostic', page.locator('text=تمرین هدفمند').count() > 0)

    # ---------------- persistence across restart (Scenario A core) ----------
    state_before = page.evaluate("JSON.parse(localStorage.getItem('matharena.v1'))")
    check('profile persisted', state_before and state_before['profile']['name'] == 'آرتین تست')
    xp_before = state_before['progress']['xp']
    stats_before = state_before['stats']['answered']

    page.evaluate("location.reload()")
    page.wait_for_timeout(2600)
    shot(page, '12-after-restart')
    check('home after restart (no onboarding again)', page.locator('.hero').count() > 0)
    state_after = page.evaluate("JSON.parse(localStorage.getItem('matharena.v1'))")
    check('xp persisted', state_after['progress']['xp'] == xp_before, f'xp={xp_before}')
    check('stats persisted', state_after['stats']['answered'] == stats_before, f'answered={stats_before}')
    check('name persisted', state_after['profile']['name'] == 'آرتین تست')

    # ---------------- other screens render ----------------
    page.click('.nav button >> nth=3')
    page.wait_for_timeout(600)
    shot(page, '13-tournaments')
    check('tournaments screen', page.locator('text=جام').count() > 0)

    page.click('.nav button >> nth=4')
    page.wait_for_timeout(600)
    shot(page, '14-profile')
    check('profile screen', page.locator('text=پروفایل من').count() > 0 or page.locator('.chip-row').count() > 0)
    check('records card', page.locator('text=رکوردهای شخصی').count() > 0)

    page.click('text=دستاوردها')
    page.wait_for_timeout(600)
    shot(page, '15-achievements')
    check('achievements screen', page.locator('text=دستاورد').count() > 0)

    page.click('button:has-text("آمار و پیشرفت")') if page.locator('button:has-text("آمار و پیشرفت")').count() else None
    page.goto(BASE + '/index.html')
    page.wait_for_timeout(2200)
    page.click('text=نبرد غول‌ها')
    page.wait_for_timeout(600)
    shot(page, '16-boss-list')
    check('boss list', page.locator('.boss-face').count() >= 7)

    # AI helper offline
    page.click('.nav button >> nth=0')
    page.wait_for_timeout(700)
    page.click('text=دفتر اشتباهات')
    page.wait_for_timeout(500)
    if page.locator('button:has-text("درخواست توضیح")').count():
        page.locator('button:has-text("درخواست توضیح")').first.click()
        page.wait_for_timeout(800)
        shot(page, '17-ai-helper')
        check('ai helper opens', page.locator('.chat-wrap').count() > 0)
        check('ai offline mode banner', page.locator('text=حالت قطعی').count() > 0)
        page.fill('.chat-input input', 'راهنمایی')
        page.click('button:has-text("ارسال")')
        page.wait_for_timeout(900)
        check('ai replies offline', page.locator('.bubble.ai').count() >= 2)
        shot(page, '18-ai-reply')

    # console errors (allowing network failures to server which is offline)
    real_errors = [e for e in errs if 'net::ERR' not in e and 'Failed to load resource' not in e]
    check('no JS console errors', len(real_errors) == 0, real_errors[:3])

    browser.close()
    pw.stop()
    static.terminate()

    failed = [n for n, ok in results if not ok]
    print(f"\n==== E2E offline: {len(results) - len(failed)}/{len(results)} passed ====")
    if failed:
        print('FAILED:', failed)
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
