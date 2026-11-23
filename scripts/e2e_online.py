#!/usr/bin/env python3
"""MATH ARENA - online E2E (Scenario B at app level).

Two independent browser clients connect to the live backend, create/join
a room, play a full server-authoritative six-stage duel through the real
UI, and both must agree on the final result.
"""
import json
import os
import subprocess
import sys
import time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, 'app')
SHOTS = os.environ.get('MA_SHOTS', '/tmp/ma-shots-online')
HTTP_PORT, API_PORT = 8493, 8083
BASE = f'http://127.0.0.1:{HTTP_PORT}'

os.makedirs(SHOTS, exist_ok=True)
results = []


def check(name, cond, extra=''):
    results.append((name, bool(cond)))
    print(('PASS  ' if cond else 'FAIL  ') + name + (' ' + str(extra) if extra else ''))


def seed_profile(name):
    state = {
        'profile': {'name': name, 'avatar': {'base': 'cat', 'color': '#3D9BFF'}, 'createdAt': int(time.time() * 1000), 'token': None, 'serverUserId': None},
        'progress': {'xp': 0, 'level': 1, 'soloRating': 1000, 'wins': 0, 'losses': 0, 'sessionsDone': 0, 'bestStreak': 0},
        'mastery': {}, 'mistakes': [], 'records': {}, 'achievements': [],
        'cosmetics': {'frames': ['default'], 'titles': ['rookie'], 'skins': ['fox'], 'equippedFrame': 'default', 'equippedTitle': 'rookie'},
        'settings': {'sound': 0, 'music': 0, 'haptics': False, 'reducedMotion': False, 'serverUrl': f'http://127.0.0.1:{API_PORT}'},
        'daily': {'date': '', 'done': False, 'score': 0},
        'stats': {'answered': 0, 'correct': 0, 'timeMs': 0, 'bySkill': {}, 'byChapter': {}},
        'pendingSessions': [], 'notifications': [], 'onboarded': True,
    }
    return json.dumps(state, ensure_ascii=False)


def main():
    # backend
    env = dict(os.environ)
    env.update({'PORT': str(API_PORT), 'MA_DATA_DIR': '/tmp/ma-e2e-online-' + str(int(time.time())), 'MA_DEBUG_DUEL': '1',
                'MA_STAGE_BREAK_MS': '350', 'MA_TOPIC_SECONDS': '4'})
    server = subprocess.Popen(['node', 'src/index.js'], cwd=os.path.join(ROOT, 'server'),
                              env=env, stdout=open('/tmp/e2e-online-server.log', 'w'), stderr=subprocess.STDOUT)
    static = subprocess.Popen([sys.executable, '-m', 'http.server', str(HTTP_PORT)],
                              cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2.0)

    pw = sync_playwright().start()
    browser = pw.chromium.launch(args=[
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=IntensiveWakeUpThrottling'])

    ctxA = browser.new_context(viewport={'width': 412, 'height': 860}, reduced_motion='reduce')
    ctxB = browser.new_context(viewport={'width': 412, 'height': 860}, reduced_motion='reduce')
    pa = ctxA.new_page()
    pb = ctxB.new_page()
    for ctx, name in ((ctxA, 'آرتین آنلاین'), (ctxB, 'نگار آنلاین')):
        ctx.add_init_script(f"localStorage.setItem('matharena.v1', {json.dumps(seed_profile(name))})")
        ctx.add_init_script("window.MA_DEBUG_DUEL = 1")

    errs = []
    for p, who in ((pa, 'A'), (pb, 'B')):
        p.on('pageerror', lambda e, w=who: (errs.append(str(e)), print(f'PAGEERROR {w}:', str(e)[:200])))
        p.on('console', lambda m, w=who: (print(f'[{w}]', m.text[:180])) if ('ma-net' in m.text or 'ma-ev' in m.text or m.type == 'error') else None)

    # ---------- load both ----------
    pa.goto(BASE + '/index.html')
    pb.goto(BASE + '/index.html')
    pa.wait_for_timeout(3000)
    pb.wait_for_timeout(3000)
    shot(pa, 'A1-home'); shot(pb, 'B1-home')
    check('A home', pa.locator('.hero').count() > 0)
    check('B home', pb.locator('.hero').count() > 0)
    check('A online banner', 'اتصال برقرار' in pa.inner_text('.conn-banner'))
    check('B online banner', 'اتصال برقرار' in pb.inner_text('.conn-banner'))

    # ---------- A creates a room ----------
    pa.click('button:has-text("بازی کن")')
    pa.wait_for_timeout(600)
    shot(pa, 'A2-playhub')
    pa.click('button.tile:has-text("ساخت اتاق")')
    pa.wait_for_timeout(500)
    pa.fill('input', 'اتاق تست ایتوئی')
    pa.locator('.switch').click()   # ranked duel
    pa.locator('.scroll button.btn.primary').last.click()
    pa.wait_for_timeout(900)
    shot(pa, 'A3-waitingroom')
    check('A in waiting room', pa.evaluate("() => window.__maScreen") == 'waiting-room')

    # ---------- B sees the room in live lobby and joins ----------
    pb.click('.nav button >> nth=0')
    pb.wait_for_timeout(800)
    pb.click('button:has-text("همه")')
    pb.wait_for_timeout(900)
    shot(pb, 'B2-lobby')
    check('B sees room in lobby', pb.locator('text=اتاق تست ایتوئی').count() > 0)
    pb.locator('button:has-text("ملحق")').first.click()
    pb.wait_for_timeout(900)
    shot(pb, 'B3-waitingroom')
    check('B joined waiting room', pb.evaluate("() => window.__maScreen") == 'waiting-room')
    check('A sees 2 players', '۲/۲' in pa.inner_text('body') or pa.locator('.avatar-badge').count() >= 2)

    # ---------- both ready, A starts ----------
    pa.click('button:has-text("آماده می‌شوم")')
    pb.click('button:has-text("آماده می‌شوم")')
    pa.wait_for_timeout(400)
    pa.click('button:has-text("شروع بازی")')
    pa.wait_for_timeout(1200)
    shot(pa, 'A4-topicpick'); shot(pb, 'B4-topicpick')
    check('A topic picker', pa.locator('.topic-card').count() == 3)
    check('B topic picker (picker is A)', pb.locator('.topic-card').count() == 3)

    # ---------- play the duel: state-driven loop ----------
    # (topic phases can auto-pass quickly; wait for whatever comes next)
    stage = 0
    questions_seen_a = questions_seen_b = 0
    deadline = time.time() + 420
    while stage < 6 and time.time() < deadline:
        a_topics = pa.locator('.topic-card').count()
        a_opts = pa.locator('.opt:not([disabled])').count()
        b_opts = pb.locator('.opt:not([disabled])').count()
        if a_topics == 3:
            # topic picker phase (A picks odd stages; B's stages auto-pass)
            pa.locator('.topic-card').first.click()
            pb.wait_for_timeout(300)
        elif a_opts in (3, 4) and b_opts in (3, 4):
            # question phase: both answer
            pa.locator('.opt:not([disabled])').nth(0).click()
            pb.locator('.opt:not([disabled])').nth(1).click()
            questions_seen_a += 1
            questions_seen_b += 1
            # wait for reveal (correct option highlighted on both)
            for _ in range(80):
                if pa.locator('.opt.correct').count() >= 1 and pb.locator('.opt.correct').count() >= 1:
                    break
                pa.wait_for_timeout(250)
            if stage == 0 and questions_seen_a == 1:
                shot(pa, 'A5-answer-result'); shot(pb, 'B5-answer-result')
                check('A sees solution sheet', pa.locator('.solution-sheet').count() > 0)
                check('B sees solution sheet', pb.locator('.solution-sheet').count() > 0)
                check('A sees correct answer highlight', pa.locator('.opt.correct').count() >= 1)
                check('A sees gained score', pa.locator('.score-float, .opt.correct').count() > 0)
            # both tap continue
            for _ in range(60):
                if pa.locator('button:has-text("ادامه")').count() and pb.locator('button:has-text("ادامه")').count():
                    break
                pa.wait_for_timeout(250)
            if pa.locator('button:has-text("ادامه")').count():
                pa.click('button:has-text("ادامه")')
            if pb.locator('button:has-text("ادامه")').count():
                pb.click('button:has-text("ادامه")')
            if questions_seen_a % 3 == 0:
                stage = questions_seen_a // 3
        else:
            # stage end / transition screen
            cur_stage = pa.evaluate("(document.body.innerText.match(/مرحلهٔ? (\d)/) || [])[1]")
            if cur_stage and int(cur_stage) > stage + 1:
                stage = int(cur_stage) - 1
            pa.wait_for_timeout(300)

    check('A played 18 questions', questions_seen_a == 18, str(questions_seen_a))
    check('B played 18 questions', questions_seen_b == 18, str(questions_seen_b))

    # ---------- results ----------
    for _ in range(120):
        if pa.locator('.verdict').count() and pb.locator('.verdict').count():
            break
        pa.wait_for_timeout(500)
    if not (pa.locator('.verdict').count() and pb.locator('.verdict').count()):
        print('DUMP A:', pa.evaluate("window.__maScreen"), pa.evaluate("document.body.innerText.slice(0, 150)"))
        print('DUMP B:', pb.evaluate("window.__maScreen"), pb.evaluate("document.body.innerText.slice(0, 150)"))
        print('A opts enabled:', pa.locator('.opt:not([disabled])').count(), 'disabled:', pa.locator('.opt[disabled]').count())
        print('B opts enabled:', pb.locator('.opt:not([disabled])').count(), 'disabled:', pb.locator('.opt[disabled]').count())
        import sys as _s; _s.stdout.flush()
    shot(pa, 'A6-results'); shot(pb, 'B6-results')
    check('A results', pa.locator('.verdict').count() > 0)
    check('B results', pb.locator('.verdict').count() > 0)

    title_a = pa.inner_text('.v-title')
    title_b = pb.inner_text('.v-title')
    check('winner verdict consistent', (title_a == 'پیروزی!' and title_b == 'باخت') or (title_a == 'باخت' and title_b == 'پیروزی!') or (title_a == title_b == 'مساوی!'), f'{title_a} vs {title_b}')
    check('rating change shown', pa.locator('.pill', has_text='رده').count() > 0)
    check('rematch button', pa.locator('button:has-text("بازی دوباره")').count() > 0)

    # ---------- rematch flow ----------
    pa.click('button:has-text("بازی دوباره")')
    pb.wait_for_timeout(400)
    pb.click('button:has-text("بازی دوباره")')
    pa.wait_for_timeout(1500)
    shot(pa, 'A7-rematch')
    check('rematch started new match', pa.locator('.topic-card').count() == 3 or pa.locator('.opt').count() == 4)

    # ---------- profiles updated via API ----------
    tokenA = pa.evaluate("JSON.parse(localStorage.getItem('matharena.v1')).profile.token")
    import urllib.request
    req = urllib.request.Request(f'http://127.0.0.1:{API_PORT}/api/me', headers={'authorization': f'Bearer {tokenA}'})
    me = json.load(urllib.request.urlopen(req))
    check('A profile online: rating games counted', me['user']['wins'] + me['user']['losses'] + me['user']['draws'] >= 1,
          f"rating={me['user']['rating']}")

    real_errors = [e for e in errs if 'net::ERR' not in e]
    check('no page errors', len(real_errors) == 0, real_errors[:3])

    browser.close()
    pw.stop()
    server.terminate()
    static.terminate()

    failed = [n for n, ok in results if not ok]
    print(f"\n==== E2E online: {len(results) - len(failed)}/{len(results)} passed ====")
    if failed:
        print('FAILED:', failed)
    sys.exit(1 if failed else 0)


def shot(page, name):
    page.screenshot(path=os.path.join(SHOTS, name + '.png'))


if __name__ == '__main__':
    main()
