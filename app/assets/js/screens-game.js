// MATH ARENA - v2 gameplay screens: six-stage duel as a battle scene,
// solo runs, boss fights, verdict results.
// All game logic (server wiring, offline engines, scoring) is preserved;
// this pass recomposes the presentation layer.
import { el, S, fa, nav, save, addXp, emit, on, uid, vibrate, chapterColor } from './core.js';
import { sfx } from './audio.js';
import {
  icon, mascot, mascotSVG, mascotReactor, avatarView, modal, toast, confetti, diffPill, emptyState,
  modeArt, heartSVG,
} from './ui.js';
import { sock, emitSock, isOnline, queueSession, autoSync } from './net.js';
import {
  createOfflineDuel, duelStartStage, duelLockTopic, duelAnswer, duelTimeout,
  duelNext, duelUseAssist, duelFinish,
  createSoloRun, soloNextQuestion, soloAnswer, soloIsOver, soloFinish,
  createBossFight, bossAnswer, bossIsOver, bossFinish, BOSSES,
  checkAchievements, scoreAnswer,
} from './game.js';
import { questionById, similarQuestion } from './data.js';
import { whiteboardFor, gcWhiteboard } from './whiteboard.js';
import { srcBadge } from './bookviewer.js';

// ---------------------------------------------------------------- helpers

const TIER_TXT = { 1: 'آسان', 2: 'متوسط', 3: 'سخت', 4: 'خبره' };
const FAM_TXT = { conceptual: 'مفهومی', reverse: 'وارونه', 'error-id': 'خطایاب',
  'multi-step': 'چندمرحله‌ای', application: 'کاربردی', comparison: 'قضاوت',
  challenge: 'چالشی', direct: 'مستقیم' };

/** 4-level difficulty marker (reasoning depth, not number size). */
function tierPill(t) {
  return el('span', { class: 'tier-pill t' + (t || 2) },
    el('i', {}), el('i', {}), el('i', {}), el('i', {}),
    el('b', { text: TIER_TXT[t || 2] || 'متوسط' }));
}

function famTag(f) {
  return el('span', { class: 'fam-tag fam-' + (f || 'direct'), text: FAM_TXT[f || 'direct'] || f });
}

/**
 * Shared question scene — exact hierarchy:
 *   1. session progress (index label + thin track)
 *   2. subject + textbook source badge (VIEW IN BOOK)
 *   3. difficulty tier + family tag
 *   4. the problem (focal point)
 *   5. answers
 *   6. whiteboard access (floating handle)
 *   7. submit/navigation (assists / continue live in the bottom bar)
 * Returns { scene, optsWrap, qcard, attachWhiteboard }.
 */
function buildQuestionScene(q, { indexLabel = '', progress = null } = {}) {
  if (!q || !q.question) {
    // defensive: never crash a run on a transient empty payload
    const s2 = el('div', { class: 'q-scene' });
    s2.append(el('div', { class: 'qcard center', style: { padding: '26px 14px' } },
      el('div', { class: 'h-sub', text: 'در حال آماده‌سازی سؤال…' })));
    return { scene: s2, optsWrap: el('div', { class: 'options' }), qcard: s2.firstChild,
             attachWhiteboard: () => null, progWrap: el('div') };
  }
  const scene = el('div', { class: 'q-scene' });
  // 1. session progress
  const progWrap = el('div', { class: 'q-progress' },
    el('span', { class: 'q-idx', text: indexLabel }),
    el('div', { class: 'prog-track' }, el('i', { style: { width: (progress == null ? 0 : Math.round(progress * 100)) + '%' } })));
  scene.append(progWrap);
  // 2+3. meta rows: subject, source badge, tier, family
  const metaRow = el('div', { class: 'q-meta' },
    el('span', { class: 'skill-chip', text: q.skillName || '' }),
    tierPill(q.tier || q.difficulty || 2),
    famTag(q.family || 'direct'));
  const srcRow = el('div', { class: 'q-src' });
  const badge = (S().settings.textbookBadge !== false) ? srcBadge(q) : null;
  if (badge) srcRow.append(badge);
  // 4. the problem
  const qcard = el('div', { class: 'qcard', style: { '--chc': chapterColor(q.chapterId) } },
    metaRow, srcRow,
    el('div', { class: 'body qexpr ' + qSize(q.question), html: q.question }));
  // 5. answers
  const optsWrap = el('div', { class: 'options' });
  scene.append(qcard, optsWrap);
  // 6. whiteboard handle slot (bottom bar appends it)
  const attachWhiteboard = (hostBar) => {
    if (S().settings.whiteboard === false) return null;
    const wb = whiteboardFor(q.id);
    hostBar.append(wb.node);
    return wb;
  };
  return { scene, optsWrap, qcard, attachWhiteboard, progWrap };
}

const ICON_CUT = `<svg class="ico" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><circle cx="6" cy="6" r="2.8"/><circle cx="6" cy="18" r="2.8"/><path d="M8.4 7.6 L20 19 M8.4 16.4 L20 5"/></svg>`;
const ICON_BULB = `<svg class="ico" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 A6.5 6.5 0 0 1 16.5 13.8 C15.7 14.5 15 15.4 15 16.5 H9 C9 15.4 8.3 14.5 7.5 13.8 A6.5 6.5 0 0 1 12 3 Z"/><path d="M9.5 19 H14.5 M10.5 21.5 H13.5"/></svg>`;
const ICON_CLOCK_SM = `<svg class="ico" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7 V12 L16 14"/></svg>`;

const CHEERS = ['آفرین!', 'ایول!', 'همینه!', 'عالی بود!', 'دیدی چی شد!'];
const OOPS = ['اشکالی نداره!', 'دفعهٔ بعد!', 'نزدیک بود!', 'یه نگاه دیگه بنداز!'];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function stagePips(stage) {
  return el('div', { class: 'stage-pips' },
    Array.from({ length: 6 }, (_, i) => el('i', { class: i + 1 < stage ? 'done' : i + 1 === stage ? 'cur' : '' })));
}

/** text length → expression size class */
function qSize(html) {
  const txt = String(html).replace(/<[^>]*>/g, '');
  if (txt.length <= 60) return 'qs-xl';
  if (txt.length <= 115) return 'qs-lg';
  if (txt.length <= 185) return 'qs-md';
  return 'qs-sm';
}

const CHECK_ICO = `<svg class="ico" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 L10 18 L20 6"/></svg>`;
const X_ICO = `<svg class="ico" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round"><path d="M6 6 L18 18 M18 6 L6 18"/></svg>`;
const CH_SYM = { ch1: '∑', ch2: '∠', ch3: 'x²', ch4: 'x', ch5: 'ƒ', ch6: 'n!', ch7: '%' };

function countdownRing(totalMs, urgentAt = 8000, size = 76) {
  const wrap = el('div', { class: 'timer-wrap' });
  const R = (size - 16) / 2, C = 2 * Math.PI * R;
  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${R}" fill="#0B1D33" stroke="#163956" stroke-width="7"/>
    <circle class="prog" cx="${size / 2}" cy="${size / 2}" r="${R}" fill="none" stroke="#38BDF8" stroke-width="7"
      stroke-dasharray="${C}" stroke-dashoffset="0" stroke-linecap="round"/>
  </svg>`;
  wrap.append(el('div', { class: 'timer-ring', html: svg + `<div class="tval">--</div>` }));
  const ring = wrap.querySelector('.prog');
  const val = wrap.querySelector('.tval');
  const box = wrap.querySelector('.timer-ring');
  const C_ = C;
  let raf = null;
  let lastSec = -1;
  function stop() { if (raf) cancelAnimationFrame(raf); raf = null; }
  function frame(endsAt, total) {
    stop();
    lastSec = -1;
    (function tick() {
      const left = Math.max(0, endsAt - Date.now());
      const frac = Math.max(0, Math.min(1, left / total));
      ring.setAttribute('stroke-dashoffset', String(C_ * (1 - frac)));
      ring.setAttribute('stroke', frac > 0.35 ? '#38BDF8' : frac > 0.16 ? '#F2B84B' : '#FB7185');
      const sec = Math.ceil(left / 1000);
      const txt = fa(sec);
      if (val.textContent !== txt) {
        val.textContent = txt;
        if (sec <= 5 && sec > 0 && sec !== lastSec) { sfx.tick(); lastSec = sec; }
      }
      box.classList.toggle('hurry', left < total * 0.3);
      box.classList.toggle('urgent', left < total * 0.16);
      if (left > 0) raf = requestAnimationFrame(tick);
    })();
  }
  return { node: wrap, frame, stop };
}

function optButton(idx, html, onclick, stacked = false) {
  return el('button', {
    class: 'opt' + (stacked ? ' stacked' : ''),
    html: `<span class="idx">${fa(idx + 1)}</span><span class="ob">${html}</span>`,
    onclick,
  });
}

function scoreFloat(container, gained, negative = false) {
  const f = el('div', { class: 'score-float' + (negative ? ' neg' : ''), text: (gained >= 0 ? '+' : '') + fa(gained) });
  f.style.top = '36%';
  f.style.left = (38 + Math.random() * 20) + '%';
  container.append(f);
  setTimeout(() => f.remove(), 1000);
}

/** full-screen edge flash feedback */
function edgeFlash(scr, good) {
  const f = el('div', { class: 'edge-flash ' + (good ? 'good' : 'bad') });
  scr.append(f);
  setTimeout(() => f.remove(), 600);
}

/** burst rings behind the correct answer */
function burst(qcard) {
  const b = el('span', { class: 'burst' });
  const b2 = el('span', { class: 'burst b2' });
  qcard.append(b, b2);
  setTimeout(() => { b.remove(); b2.remove(); }, 700);
}

/** bump a score element */
function bump(node) {
  if (!node) return;
  node.classList.remove('bump');
  void node.offsetWidth;
  node.classList.add('bump');
}

// ================================================================ DUEL

export function duelScreen(params) {
  // params: {online: bool, matchId?, config? {vsBot, botLevel, passAndPlay, chapterFilter, ranked}}
  const scr = el('div', { class: 'screen' });
  const arena = el('div', { class: 'playfield' });
  // floating environment symbols
  for (let i = 0; i < 6; i++) {
    const s = el('span', {
      class: 'float-sym', text: ['\u2211', '\u221A', '\u03C0', '\u00F7', '\u00D7', '+'][i],
      style: {
        top: (8 + Math.random() * 80) + '%', left: (Math.random() * 90) + '%',
        fontSize: (15 + Math.random() * 22) + 'px', fontWeight: '900',
        animationDuration: (5 + Math.random() * 6).toFixed(1) + 's', animationDelay: (-Math.random() * 5).toFixed(1) + 's',
      },
    });
    arena.append(s);
  }
  scr.append(arena);

  const state = {
    online: params.online && isOnline(),
    matchId: params.matchId || null,
    duel: params.online ? null : createOfflineDuel(params.config || { vsBot: true, botLevel: 2 }),
    opp: params.opponent || null,
    myScore: 0, oppScore: 0, myStreak: 0,
    currentQ: null, qIndex: 0, stage: 0,
    answered: false, oppAnswered: false,
    assists: { removeTwo: 1, thinkingTime: 1, conceptClue: 1 },
    removed: [], stageHistory: [], wasBehind: false, wb: null,
    topicChoices: null, isPicker: false, deadline: 0,
    passPlayer: 0, // pass-and-play current answerer
    resultToken: 0,
  };

  const ring = countdownRing(0, 8000, 64);
  const reactor = mascotReactor(78);
  let unsubs = [];
  let mainTimer = null;
  let solved = false;

  // ---------------- online wiring ----------------
  if (state.online) {
    const onEv = (ev, fn) => unsubs.push(on(ev, fn));
    onEv('srv:match:stage_start', (p) => {
      if (p.matchId !== state.matchId) return;
      state.stage = p.stage; state.topicChoices = p.topics;
      state.isPicker = p.picker === S().profile?.serverUserId;
      state.deadline = p.deadline;
      sfx.stage();
      renderTopicPick(p);
    });
    onEv('srv:match:topic_locked', (p) => { if (p.matchId === state.matchId) sfx.tap(); });
    onEv('srv:match:question', (p) => {
      if (p.matchId !== state.matchId) return;
      state.currentQ = p.question; state.qIndex = p.qIndex; state.stage = p.stage;
      // fill v2 fields from the local bank copy when the server payload is lean
      if (state.currentQ && !state.currentQ.family) {
        const local = questionById(state.currentQ.id);
        if (local) Object.assign(state.currentQ, {
          family: local.family, tier: local.tier, tierLabel: local.tierLabel,
          familyLabel: local.familyLabel, bookPage: local.bookPage,
          sourcePages: local.sourcePages, optionFeedback: local.optionFeedback,
        });
      }
      state.answered = false; state.oppAnswered = false; state.removed = [];
      sfx.matchStart();
      renderQuestion(p.endsAt, p.totalMs);
    });
    onEv('srv:match:answer_received', () => { state.oppAnswered = true; updateOppDot('done'); });
    onEv('srv:match:timer', (p) => {
      if (p.matchId !== state.matchId) return;
      ring.frame(p.endsAt, p.endsAt - Date.now() + 1000);
      toast('حریف زمان فکر کرد!', { icon: 'clock' });
    });
    onEv('srv:match:assist_result', (p) => {
      if (p.type === 'removeTwo') { state.removed = p.remove; markRemoved(); }
      if (p.type === 'conceptClue') showHintModal(p.hint);
    });
    onEv('srv:match:answer_result', (p) => {
      if (p.matchId !== state.matchId) return;
      const mine = p.players.find(x => x.userId === S().profile?.serverUserId);
      const theirs = p.players.find(x => x.userId !== S().profile?.serverUserId);
      handleResult(mine, theirs, p);
    });
    onEv('srv:match:continue_ack', (p) => { if (p.matchId === state.matchId) updateOppDot('done'); });
    onEv('srv:match:stage_end', (p) => { if (p.matchId === state.matchId) renderStageEnd(p); });
    onEv('srv:match:completed', (p) => { if (p.matchId === state.matchId) finishOnline(p); });
    onEv('srv:match:opponent_disconnected', (p) => {
      if (p.matchId !== state.matchId) return;
      toast('حریف قطع شد — منتظر بازگشت...', { icon: 'wifi' });
      updateOppDot('think');
    });
    onEv('srv:match:opponent_reconnected', () => updateOppDot(''));
    onEv('srv:match:emote', (p) => toast('حریف: ' + ({ hi: 'سلام!', 'good-luck': 'موفق باشی!', nice: 'آفرین!', oops: 'وای!', gg: 'بازی خوبی بود' })[p.kind] || '', { dur: 1800 }));
  }

  // ---------------- HUD ----------------
  function buildHUD(oppName, oppAvatar, withTimer = false) {
    arena.innerHTML = '';
    const me = S().profile || { name: 'من', avatar: { base: 'fox', color: '#FF8A3D' } };
    const hud = el('div', { class: 'duel-hud' },
      el('div', { class: 'pchip' },
        el('span', { class: 'pc-av' }, avatarView(me.avatar, 38)),
        el('div', { class: 'grow', style: { minWidth: '0' } },
          el('div', { class: 'pc-name', text: me.name }),
          el('div', { class: 'scoreval', id: 'sc-me', text: fa(state.myScore) })),
        el('span', { class: 'st', id: 'dot-me' })),
      el('div', { class: 'vs-core' },
        withTimer ? ring.node : el('div', { class: 'vs-emblem', text: 'VS' }),
        stagePips(Math.max(1, state.stage))),
      el('div', { class: 'pchip right' },
        el('span', { class: 'pc-av' }, avatarView(oppAvatar || { base: 'cat', color: '#3D9BFF' }, 38)),
        el('div', { class: 'grow', style: { minWidth: '0' } },
          el('div', { class: 'pc-name', text: oppName || 'حریف' }),
          el('div', { class: 'scoreval', id: 'sc-opp', text: fa(state.oppScore) })),
        el('span', { class: 'st', id: 'dot-opp' })));
    arena.append(hud);
    return hud;
  }
  function updateHUD({ animateMine = false, animateOpp = false } = {}) {
    const a = arena.querySelector('#sc-me');
    const b = arena.querySelector('#sc-opp');
    if (a) { a.textContent = fa(state.myScore); if (animateMine) bump(a); }
    if (b) { b.textContent = fa(state.oppScore); if (animateOpp) bump(b); }
    const pips = arena.querySelector('.stage-pips');
    if (pips) {
      [...pips.children].forEach((i, idx) => {
        i.className = idx + 1 < state.stage ? 'done' : idx + 1 === state.stage ? 'cur' : '';
      });
    }
  }
  function updateOppDot(cls) {
    const d = arena.querySelector('#dot-opp');
    if (d) d.className = 'st ' + cls;
  }
  function updateMyDot(cls) {
    const d = arena.querySelector('#dot-me');
    if (d) d.className = 'st ' + cls;
  }

  // ---------------- topic picker ----------------
  function renderTopicPick(p) {
    ring.stop();
    solved = false;
    arena.innerHTML = '';
    buildHUD(state.opp?.name, state.opp?.avatar);
    const note = state.online
      ? (state.isPicker ? 'نوبت توست! یک موضوع انتخاب کن' : 'حریف دارد موضوع انتخاب می‌کند...')
      : (state.duel.pickerIdx === 0 || state.duel.config.passAndPlay ? 'یک موضوع انتخاب کن' : 'ربات دارد انتخاب می‌کند...');
    const topics = p.topics;
    const colors = ['#0E2A47', '#103054', '#0C2440'];
    const syms = ['\u2211', '\u0192', '\u221a'];
    const topicCards = topics.map((t, i) => {
      const btn = el('button', { class: 'topic-card t' + i });
      btn.append(
        el('div', {
          class: 'tico',
          html: `<svg viewBox="0 0 54 54" width="54" height="54"><rect x="3" y="3" width="48" height="48" rx="15" fill="${colors[i]}" stroke="#38BDF8" stroke-width="2"/><circle cx="27" cy="27" r="17" fill="rgba(255,255,255,.25)"/><text x="27" y="35" text-anchor="middle" font-size="23" font-weight="900" fill="#fff" font-family="sans-serif">${syms[i]}</text></svg>`,
        }),
        el('div', { class: 'grow' },
          el('h4', { text: t.name }),
          el('div', { class: 'sub', text: t.chapterId ? 'فصل ' + fa(t.chapterId.replace('ch', '')) : '' })));
      btn.addEventListener('click', async () => {
        sfx.tap();
        if (state.online) {
          const ack = await emitSock('match:pick_topic', { matchId: state.matchId, skillId: t.skillId });
          if (!ack.ok) toast('خطا در انتخاب موضوع');
        } else if (state.duel.pickerIdx === 0 || state.duel.config.passAndPlay) {
          duelLockTopic(state.duel, t.skillId);
          startOfflineQuestion();
        }
      });
      return btn;
    });
    const wrap = el('div', { class: 'qcard', style: { '--chc': 'var(--purple)' } });
    wrap.append(
      el('div', { class: 'row between' },
        el('h3', { class: 'h-title', text: 'انتخاب موضوع مرحلهٔ ' + fa(p.stage) })),
      el('div', { class: 'picker-note tiny', text: note }),
      el('div', { class: 'topic-grid', style: { marginTop: '6px' } }, topicCards));
    if (state.online) {
      wrap.append(el('div', { class: 'center tiny muted', text: 'هر دو بازیکن روی موضوع واحد رقابت می‌کنند' }));
    }
    arena.append(wrap);

    // offline: bot picks after delay when it is picker
    if (!state.online && state.duel.config.vsBot && state.duel.pickerIdx === 1) {
      setTimeout(() => {
        if (state.duel.state === 'topic_pick') {
          const t = topics[Math.floor(Math.random() * 3)];
          duelLockTopic(state.duel, t.skillId);
          startOfflineQuestion();
        }
      }, 1400);
    }
  }


  // ---------------- question render ----------------
  function renderQuestion(endsAt, totalMs, qOverride = null) {
    solved = false;
    state.resultToken++;
    const q = qOverride || state.currentQ;
    const total = totalMs || q.estimatedSeconds * 1000 * (state.online ? 1 : 1);
    arena.innerHTML = '';
    buildHUD(state.opp?.name, state.opp?.avatar, true);
    if (state.myStreak >= 2) {
      const cb = el('span', { class: 'combo-badge', 'data-lv': Math.min(4, state.myStreak), text: 'کمبو ×' + fa(state.myStreak) });
      arena.append(cb);
    }
    const built = buildQuestionScene(q, {
      indexLabel: 'سؤال ' + fa((state.qIndex || 0) + 1) + ' از ' + fa(3),
      progress: ((state.qIndex || 0) + 1) / 3,
    });
    const qcard = built.qcard;
    const opts = built.optsWrap;
    q.options.forEach((html, idx) => {
      const isCmp = (q.family === 'comparison');
      opts.append(optButton(idx, html, () => answer(idx), isCmp));
    });
    const assistBar = el('div', { class: 'assist-bar' },
      el('button', { class: 'assist', html: ICON_CUT + '<span>حذف دو گزینه</span>', onclick: () => useAssist('removeTwo') }),
      el('button', { class: 'assist', html: ICON_CLOCK_SM + '<span>زمان فکر</span>', onclick: () => useAssist('thinkingTime') }),
      el('button', { class: 'assist', html: ICON_BULB + '<span>سرنخ مفهومی</span>', onclick: () => useAssist('conceptClue') }));
    arena.append(built.scene, assistBar);
    if (state.wb) state.wb.destroy();
    state.wb = built.attachWhiteboard(assistBar);
    ring.frame(endsAt, total);
    state.qEndsAt = endsAt; state.qTotalMs = total;
    reactor.node.style.display = '';
    reactor.set('competitive');

    // pass-and-play gate
    if (!state.online && state.duel.config.passAndPlay) {
      showPassGate();
    }

    // offline timers
    if (!state.online) {
      clearTimeout(mainTimer);
      mainTimer = setTimeout(() => {
        if (state.duel.state === 'question') {
          duelTimeout(state.duel);
          revealOfflineResult();
        }
      }, total + 300);
    }
    updateMyDot('');
    updateOppDot('');
    updateAssistBar();
  }

  function showPassGate() {
    const who = state.passPlayer === 0 ? 'بازیکن ۱' : 'بازیکن ۲';
    const gate = el('div', {
      class: 'modal-back',
    }, el('div', { class: 'modal card center' },
      el('h3', { class: 'h-title', text: 'نوبت ' + who }),
      el('p', { class: 'muted', text: 'دستگاه را بده و دکمهٔ آماده را بزن' }),
      el('button', { class: 'btn primary', text: 'آماده‌ام!', onclick: () => gate.remove() })));
    scr.append(gate);
    vibrate(80);
  }

  async function answer(idx) {
    if (solved || state.answered) return;
    if (state.online) {
      state.answered = true;
      const ack = await emitSock('match:answer', { matchId: state.matchId, qIndex: state.qIndex, optionIndex: idx });
      if (!ack.ok) { state.answered = false; toast(ack.error === 'too-late' ? 'زمان تمام شد!' : 'خطا'); return; }
      updateMyDot('done');
      lockOptions(idx, null);
      if (!state.oppAnswered) toast('منتظر حریف...', { dur: 1400 });
    } else {
      const player = state.duel.config.passAndPlay ? state.passPlayer : 0;
      const ok = duelAnswer(state.duel, player, idx);
      if (!ok) return;
      if (state.duel.config.passAndPlay && !state.duel.answered[1 - player]) {
        state.passPlayer = 1 - player;
        lockOptions(idx, player);
        showPassGate();
        renderQuestion(state.duel.qEndsAt, state.duel.qTotalMs, state.duel.currentQ);
      } else if (state.duel.config.vsBot && !state.duel.answered[1]) {
        // waiting for the bot's answer (it fires duel:opponent_answered)
        lockOptions(idx, null);
        updateMyDot('done');
        toast('منتظر ربات...', { dur: 1200 });
      } else {
        revealOfflineResult();
      }
    }
  }

  function lockOptions(chosen, forPlayer) {
    [...arena.querySelectorAll('.opt')].forEach((b, i) => {
      if (state.removed.includes(i)) return;
      b.disabled = true;
    });
  }

  function markRemoved() {
    [...arena.querySelectorAll('.opt')].forEach((b, i) => {
      if (state.removed.includes(i)) b.classList.add('removed');
    });
    sfx.combo(3);
  }

  async function useAssist(type) {
    if (state.online) {
      const ack = await emitSock('match:assist', { matchId: state.matchId, type });
      if (!ack.ok) { toast(ack.error === 'assist-exhausted' ? 'این کمک استفاده شده!' : 'الان نمی‌شود'); return; }
      state.assists[type] -= 1;
      if (type === 'removeTwo') { state.removed = ack.remove; markRemoved(); sfx.combo(3); }
      if (type === 'thinkingTime') { sfx.tap(); }
      if (type === 'conceptClue') showHintModal(ack.hint);
    } else {
      const res = duelUseAssist(state.duel, 0, type);
      if (!res.ok) { toast('این کمک استفاده شده!'); return; }
      if (type === 'removeTwo') { state.removed = res.remove; markRemoved(); sfx.combo(3); }
      if (type === 'conceptClue') showHintModal(res.hint);
      if (type === 'thinkingTime') {
        ring.frame(state.duel.qEndsAt, state.duel.qTotalMs);
        clearTimeout(mainTimer);
        mainTimer = setTimeout(() => {
          if (state.duel.state === 'question') { duelTimeout(state.duel); revealOfflineResult(); }
        }, state.duel.qEndsAt - Date.now() + 300);
        sfx.tap();
      }
    }
    updateAssistBar();
  }

  function updateAssistBar() {
    const btns = arena.querySelectorAll('.assist');
    if (btns.length >= 3) {
      btns[0].disabled = (state.online ? state.assists : state.duel.assists[0]).removeTwo <= 0;
      btns[1].disabled = (state.online ? state.assists : state.duel.assists[0]).thinkingTime <= 0;
      btns[2].disabled = (state.online ? state.assists : state.duel.assists[0]).conceptClue <= 0;
    }
  }

  function showHintModal(hint) {
    sfx.notify();
    scr.append(modal({
      title: 'سرنخ مفهومی',
      body: el('div', {},
        el('div', { class: 'row', style: { gap: '10px', alignItems: 'flex-start' } },
          mascot('thinking', 'think', 76),
          el('p', { style: { margin: '0', lineHeight: '2' }, text: hint })),
        el('p', { class: 'tiny muted', text: 'راهنمایی راه‌حل را نشان نمی‌دهد؛ خودت را امتحان کن!' })),
      actions: [{ label: 'فهمیدم', cls: 'primary' }],
    }));
  }

  // ---------------- result reveal ----------------
  function handleResult(mine, theirs, p) {
    solved = true;
    ring.stop();
    // mascot steps aside so the verdict strip owns the corner
    reactor.node.style.display = 'none';
    const q = state.currentQ || (state.duel && state.duel.currentQ);
    const qcard = arena.querySelector('.qcard');
    const opts = [...arena.querySelectorAll('.opt')];
    opts.forEach((b, i) => {
      b.disabled = true;
      if (i === p.correctIndex) b.classList.add('correct');
      else if (mine && i === mine.chose) b.classList.add('wrong');
    });
    const prevMy = state.myScore, prevOpp = state.oppScore;
    if (mine?.correct) {
      sfx.correct();
      state.myStreak = mine.streak;
      state.myScore = mine.score;
      scoreFloat(arena, mine.gained);
      burst(qcard);
      edgeFlash(scr, true);
      vibrate(40);
      reactor.set(state.myStreak >= 3 ? 'excited' : 'cheer', pick(CHEERS));
    } else {
      sfx.wrong();
      state.myStreak = 0;
      if (mine) state.myScore = mine.score;
      edgeFlash(scr, false);
      reactor.set('disappointed', mine == null ? 'زمان تمام شد!' : pick(OOPS));
    }
    if (theirs) state.oppScore = theirs.score;
    updateHUD({ animateMine: state.myScore !== prevMy, animateOpp: state.oppScore !== prevOpp });
    // combo badge refresh
    const oldCombo = arena.querySelector('.combo-badge');
    if (oldCombo) oldCombo.remove();
    if (state.myStreak >= 2) {
      arena.append(el('span', { class: 'combo-badge', 'data-lv': Math.min(4, state.myStreak), text: 'کمبو ×' + fa(state.myStreak) }));
      if (state.myStreak >= 3) sfx.combo(state.myStreak);
    }
    // verdict strip — instant readable outcome
    const strip = el('div', { class: 'verdict-strip ' + (mine?.correct ? 'good' : 'bad') },
      el('span', { class: 'v-ico', html: mine?.correct ? CHECK_ICO : X_ICO }),
      el('span', { text: mine?.correct ? ('درست بود!' + (mine.gained ? '  +' + fa(mine.gained) : '')) : (mine == null ? 'زمان تمام شد!' : 'اشتباه بود') }),
      el('span', { class: 'v-sub', text: mine?.correct ? ('کمبو ×' + fa(mine.streak || 1)) : ('جواب درست: گزینهٔ ' + fa(p.correctIndex + 1)) }));
    qcard && qcard.append(strip);
    // why-was-my-answer-wrong sheet (uses the distractor's own feedback)
    const fbList = (Array.isArray(state.currentQ?.optionFeedback) ? state.currentQ.optionFeedback : null);
    let mistakeLine = '';
    if (!mine?.correct && mine && mine.chose != null && fbList && fbList[mine.chose]) {
      mistakeLine = `<div class="optfb"><span class="lbl">خطای انتخاب تو</span> ${fbList[mine.chose]}</div>`;
    }
    // solution sheet
    const sheet = el('div', {
      class: 'solution-sheet',
      html: `${mistakeLine}<span class="lbl">راه‌حل</span> ${p.solution}<br><span class="lbl">مفهوم</span> ${p.conceptExplanation}<br><span class="lbl">مراقب باش</span> ${p.commonMistake}`,
    });
    qcard && qcard.append(sheet);
    // retry-mistake with fresh variant (learning hook)
    if (!mine?.correct) {
      import('./core.js').then(({ S }) => { /* mistake recorded offline engine */ });
    }
    const resultToken = ++state.resultToken;
    setTimeout(() => {
      if (state.resultToken !== resultToken) return;   // question already replaced
      const btn = el('button', {
        class: 'btn primary block big', text: 'ادامه ←',
        onclick: async () => {
          btn.remove();
          if (state.online) {
            const ack = await emitSock('match:continue', { matchId: state.matchId });
            if (!ack.ok && ack.error !== 'offline') { /* server timeout handles it */ }
          } else {
            nextStep();
          }
        },
      });
      arena.append(btn);
    }, 380);
  }

  function revealOfflineResult() {
    if (solved) return;
    const r = state.duel.lastResult;
    if (!r || !r.players) return;
    const mine = r.players[0], theirs = r.players[1];
    handleResult(mine, theirs, {
      correctIndex: r.correctIndex,
      solution: state.duel.currentQ.solution,
      conceptExplanation: state.duel.currentQ.conceptExplanation,
      commonMistake: state.duel.currentQ.commonMistake,
    });
  }

  function nextStep() {
    if (state.online) return; // server drives next question
    const res = duelNext(state.duel);
    if (res.stageEnd) {
      renderStageEndOffline();
    } else {
      state.passPlayer = 0;
      renderQuestion(state.duel.qEndsAt, state.duel.qTotalMs, state.duel.currentQ);
      updateAssistBar();
    }
  }

  function renderStageEnd(p) {
    ring.stop();
    arena.innerHTML = '';
    const scores = p.scores || [];
    const mine = scores.find(x => x.userId === S().profile?.serverUserId);
    const theirs = scores.find(x => x.userId !== S().profile?.serverUserId);
    const winning = (mine?.score || 0) >= (theirs?.score || 0);
    arena.append(el('div', { class: 'qcard center stagewin', style: { '--chc': winning ? 'var(--lime)' : 'var(--coral)', justifyContent: 'center', gap: '12px' } },
      el('div', { class: 'big-emoji' }, mascot(winning ? 'celebrating' : 'determined', 'happy', 116)),
      el('h3', { class: 'h-display', text: 'پایان مرحلهٔ ' + fa(p.stage) }),
      el('div', { class: 'duel-score-row' },
        el('div', { class: 'side' }, el('div', { class: 'v', text: fa(mine?.score || 0) }), el('div', { class: 'k', text: 'تو' })),
        el('div', { class: 'mid', text: 'در برابر' }),
        el('div', { class: 'side' }, el('div', { class: 'v', text: fa(theirs?.score || 0) }), el('div', { class: 'k', text: 'حریف' }))),
      el('div', { class: 'tiny muted', text: 'مرحلهٔ بعد در راه است...' })));
    sfx.stage();
  }

  function renderStageEndOffline() {
    const d = state.duel;
    arena.innerHTML = '';
    const perfect = d.wrongs[0] === 0;
    const winning = d.scores[0] >= d.scores[1];
    checkAchievements({ type: 'stage-end', perfect });
    arena.append(el('div', { class: 'qcard center stagewin', style: { '--chc': winning ? 'var(--lime)' : 'var(--coral)', justifyContent: 'center', gap: '12px' } },
      mascot(perfect ? 'celebrating' : winning ? 'happy' : 'determined', 'happy', 116),
      el('h3', { class: 'h-display', text: 'پایان مرحلهٔ ' + fa(d.stage) }),
      el('div', { class: 'duel-score-row' },
        el('div', { class: 'side' }, el('div', { class: 'v', text: fa(d.scores[0]) }), el('div', { class: 'k', text: (d.config.passAndPlay ? 'بازیکن ۱' : 'تو') })),
        el('div', { class: 'mid', text: 'در برابر' }),
        el('div', { class: 'side' }, el('div', { class: 'v', text: fa(d.scores[1]) }), el('div', { class: 'k', text: d.config.passAndPlay ? 'بازیکن ۲' : 'ربات' }))),
      el('button', {
        class: 'btn primary big', text: d.stage >= 6 ? 'دیدن نتیجه 🏁' : 'مرحلهٔ بعد ←',
        onclick: () => {
          const stageInfo = duelStartStage(d);
          if (!stageInfo) {
            duelFinish(d);
            nav('results', { kind: 'duel-offline', duel: d });
          } else {
            renderTopicPick(stageInfo);
          }
        },
      })));
    sfx.stage();
  }

  function finishOnline(p) {
    ring.stop();
    const meId = S().profile?.serverUserId;
    const iWon = p.winner === meId;
    const draw = p.winner === null;
    sfx.victory();
    if (iWon || draw) confetti();
    else sfx.defeat();
    nav('results', {
      kind: 'duel-online',
      won: iWon, draw,
      myScore: p.players.find(x => x.userId === meId)?.score || 0,
      oppScore: p.players.find(x => x.userId !== meId)?.score || 0,
      players: p.players, ratingChanges: p.ratingChanges, xp: p.xp?.[meId]?.gain || 0,
      matchId: state.matchId, opponent: state.opp,
    });
  }

  // ---------------- offline duel bootstrap ----------------
  function startOfflineQuestion() {
    renderQuestion(state.duel.qEndsAt, state.duel.qTotalMs, state.duel.currentQ);
    updateAssistBar();
  }

  // offline bot: reveal result once the bot has answered too
  unsubs.push(on('duel:opponent_answered', () => {
    if (state.online || !state.duel) return;
    if (state.duel.answered[0] && state.duel.answered[1] && !solved) {
      revealOfflineResult();
    }
  }));

  // ---------------- boot ----------------
  if (state.online) {
    buildHUD(state.opp?.name, state.opp?.avatar);
    arena.append(el('div', { class: 'qcard center', id: 'duel-wait', style: { justifyContent: 'center', gap: '10px', '--chc': 'var(--purple)' } },
      mascot('excited', 'happy', 96),
      el('div', { class: 'h-sub', text: 'در حال ورود به میدان...' })));
    // ask server for current match state (covers events fired before we opened)
    emitSock('match:subscribe', { matchId: state.matchId }).then((ack) => {
      const w = arena.querySelector('#duel-wait');
      if (w && ack.ok) w.remove();
      else if (w) { w.innerHTML = ''; w.append(emptyState('sad', 'مسابقه پیدا نشد', 'شاید تمام شده باشد'), el('button', { class: 'btn', text: 'بازگشت', onclick: () => nav('home') })); }
    });
    unsubs.push(on('srv:match:resync', (p) => {
      if (p.matchId !== state.matchId) return;
      const w = arena.querySelector('#duel-wait');
      if (w) w.remove();
      state.stage = p.stage;
      if (p.state === 'topic_pick' && p.topics) {
        state.topicChoices = p.topics;
        state.isPicker = (p.picker ?? S().profile?.serverUserId) === S().profile?.serverUserId;
        renderTopicPick({ stage: p.stage, topics: p.topics, picker: p.picker });
      } else if ((p.state === 'question' || p.state === 'locked') && p.question) {
        state.currentQ = p.question;
        state.qIndex = p.qIndex;
        state.answered = p.answered;
        renderQuestion(p.endsAt, p.totalMs || (p.endsAt - Date.now()));
        if (p.answered) lockOptions(null, null);
      }
      // scores refresh
      if (p.scores) {
        const meId = S().profile?.serverUserId;
        const mine = p.scores.find(x => x.userId === meId);
        const theirs = p.scores.find(x => x.userId !== meId);
        if (mine) state.myScore = mine.score;
        if (theirs) state.oppScore = theirs.score;
        updateHUD();
      }
    }));
  } else {
    const stageInfo = duelStartStage(state.duel);
    if (!stageInfo) {
      const r = duelFinish(state.duel);
      nav('results', { kind: 'duel-offline', duel: state.duel });
    } else {
      renderTopicPick(stageInfo);
    }
  }

  return {
    node: scr,
    cleanup() {
      unsubs.forEach(u => u());
      clearTimeout(mainTimer);
      clearTimeout(state.duel?.botTimer);
      ring.stop();
      if (state.wb) { state.wb.destroy(); state.wb = null; }
      gcWhiteboard([state.currentQ?.id].filter(Boolean));
    },
  };
}

// ================================================================ SOLO MODES

export const SOLO_MODES = {
  blitz: { name: 'برق‌آسا', desc: '۹۰ ثانیه، بیشترین امتیاز', emoji: '⚡', duration: 90, color: '#FFC53D' },
  survival: { name: 'بقا', desc: '۳ جان، سؤالهای سخت‌تر شونده', emoji: '❤', lives: 3, color: '#FF5D73' },
  survivalPractice: { name: 'بقا (تمرینی)', desc: 'بدون از دست دادن جان', emoji: '🌱', lives: null, color: '#7BC950' },
  marathon: { name: 'ماراتن', desc: '۳۰ سؤال از همهٔ فصل‌ها', emoji: '🏃', questionCount: 30, color: '#3D9BFF' },
  precision: { name: 'دقت', desc: '۱۲ سؤال سخت‌تر، وقت بیشتر، یک راهنما', emoji: '🎯', questionCount: 12, color: '#8B5CF6' },
  record: { name: 'رکورد', desc: 'رکورد شخصی خودت را بشکن', emoji: '🏆', questionCount: 15, color: '#FF8A3D' },
};

export function soloScreen(params) {
  // params: {mode, chapterFilter?}
  const modeCfg = SOLO_MODES[params.mode] || SOLO_MODES.blitz;
  const run = createSoloRun({
    mode: params.mode === 'survivalPractice' ? 'survival' : params.mode,
    chapterFilter: params.chapterFilter || 'mixed',
    durationSec: modeCfg.duration,
    questionCount: modeCfg.questionCount,
    lives: params.mode === 'survivalPractice' ? null : (modeCfg.lives ?? null),
  });
  run.realMode = params.mode;

  const scr = el('div', { class: 'screen' });
  const arena = el('div', { class: 'playfield' });
  for (let i = 0; i < 6; i++) {
    arena.append(el('span', {
      class: 'float-sym', text: ['\u2211', '\u221A', '\u03C0', '\u00F7', '\u00D7', '+'][i],
      style: {
        top: (8 + Math.random() * 80) + '%', left: (Math.random() * 90) + '%',
        fontSize: (15 + Math.random() * 22) + 'px', fontWeight: '900',
        animationDuration: (5 + Math.random() * 6).toFixed(1) + 's', animationDelay: (-Math.random() * 5).toFixed(1) + 's',
      },
    }));
  }
  scr.append(arena);
  const ring = countdownRing(0, 8000, 76);
  const reactor = mascotReactor(72);
  let solved = false;
  let globalTimer = null;
  let q = null;

  function hud() {
    const hearts = run.lives !== null
      ? el('span', { class: 'hearts' }, Array.from({ length: 3 }, (_, i) => el('i', { html: heartSVG(i < run.lives, 15) })))
      : '';
    const items = [
      el('span', { class: 'pill ' + (run.mode === 'blitz' ? 'gold' : 'blue'), style: { padding: '4px 10px' } },
        el('span', { html: modeArt(params.mode === 'survivalPractice' ? 'sprout' : params.mode, 18), style: { display: 'inline-block', verticalAlign: '-4px' } }),
        el('span', { text: ' ' + modeCfg.name })),
      hearts,
      el('span', { class: 'pill', text: fa(run.score) + ' امتیاز' }),
    ];
    if (run.streak >= 2) items.push(el('span', { class: 'pill purple', text: 'کمبو ×' + fa(run.streak) }));
    if (run.questionCount) items.push(el('span', { class: 'pill', text: fa(run.answers.length) + '/' + fa(run.questionCount) }));
    return el('div', { class: 'runstrip' }, items);
  }

  let wb = null;
  function renderQ() {
    solved = false;
    q = soloNextQuestion(run);
    arena.innerHTML = '';
    arena.append(hud());
    ring.node.style.margin = '0 auto 4px';
    arena.append(ring.node);
    const total = run.questionCount || (run.mode === 'blitz' ? null : null);
    const built = buildQuestionScene(q, {
      indexLabel: total ? ('سؤال ' + fa(run.answers.length + 1) + ' از ' + fa(total)) : ('سؤال ' + fa(run.answers.length + 1)),
      progress: total ? (run.answers.length + 1) / total : null,
    });
    const qcard = built.qcard;
    const opts = built.optsWrap;
    q.options.forEach((html, idx) => {
      opts.append(optButton(idx, html, () => pick(idx), q.family === 'comparison'));
    });
    const bar = el('div', { class: 'assist-bar' },
      el('button', {
        class: 'assist', html: ICON_BULB + '<span>راهنما (' + fa(run.hintsLeft) + ')</span>',
        disabled: run.hintsLeft <= 0,
        onclick: () => { if (run.hintsLeft > 0) { run.hintsLeft--; showHint(q); bar.firstElementChild.disabled = true; } },
      }));
    arena.append(built.scene, bar);
    if (wb) wb.destroy();
    wb = built.attachWhiteboard(bar);
    ring.frame(run.qEndsAt, run.qTotalMs);
    reactor.set('thinking');
    // question timeout
    clearTimeout(globalTimer);
    globalTimer = setTimeout(() => {
      if (!solved) { finalizePick(null); }
    }, run.qEndsAt - Date.now() + 350);
  }

  function showHint(qq) {
    sfx.notify();
    scr.append(modal({
      title: 'راهنما', body: el('p', { text: qq.conceptHint, style: { lineHeight: '2' } }),
      actions: [{ label: 'فهمیدم', cls: 'primary' }],
    }));
  }

  function finalizePick(idx) {
    solved = true;
    const res = idx === null ? { correct: false } : soloAnswer(run, idx);
    const opts = [...arena.querySelectorAll('.opt')];
    const qcard = arena.querySelector('.qcard');
    // per-distractor mistake explanation
    if (!res.correct && idx != null && Array.isArray(q.optionFeedback) && q.optionFeedback[idx]) {
      qcard && qcard.append(el('div', {
        class: 'optfb sheet-in',
        html: `<span class="lbl">خطای انتخاب تو</span> ${q.optionFeedback[idx]}`,
      }));
    }
    opts.forEach((b, i) => {
      b.disabled = true;
      if (i === q.correctIndex) b.classList.add('correct');
      else if (i === idx) b.classList.add('wrong');
    });
    if (res.correct) {
      sfx.correct();
      scoreFloat(arena, res.gained);
      burst(qcard);
      edgeFlash(scr, true);
      vibrate(30);
      reactor.set(run.streak >= 3 ? 'excited' : 'cheer', pick(CHEERS));
      if (run.streak >= 3) sfx.combo(run.streak);
    } else {
      sfx.wrong();
      edgeFlash(scr, false);
      reactor.set('disappointed', idx === null ? 'زمان تمام شد!' : pick(OOPS));
    }
    checkAchievements({ type: 'answer', streak: run.streak, skillChapter: q.chapterId });
    setTimeout(() => {
      if (soloIsOver(run)) {
        finish();
      } else {
        renderQ();
      }
    }, res.correct ? 700 : 1300);
  }

  function pick(idx) {
    if (solved) return;
    finalizePick(idx);
  }

  function finish() {
    ring.stop();
    clearTimeout(globalTimer);
    const res = soloFinish(run);
    checkAchievements({ type: 'solo-end' });
    if (params.daily) {
      const s = S();
      s.daily = { date: params.daily.day, done: true, score: run.score };
      addXp(60 - (res.xpGain || 0) > 0 ? 30 : 0);
      save();
    }
    queueSession({ sessionId: 'solo-' + run.seed, mode: run.realMode, correct: run.correct, total: run.answers.length, startedAt: run.startedAt });
    autoSync();
    if (res.isRecord && run.answers.length > 3) { sfx.levelup(); confetti({ count: 60 }); }
    nav('results', {
      kind: 'solo', mode: run.realMode, run, res,
      won: run.mode === 'survival' ? run.lives > 0 : (run.answers.length ? run.correct / run.answers.length >= 0.6 : false),
    });
  }

  renderQ();
  return { node: scr, cleanup() { ring.stop(); clearTimeout(globalTimer); if (wb) wb.destroy(); gcWhiteboard([q?.id].filter(Boolean)); } };
}

// ================================================================ BOSS

export function bossScreen(params) {
  const bossId = params.bossId || 'boss-ch1';
  const fight = createBossFight(bossId);
  const scr = el('div', { class: 'screen' });
  const arena = el('div', { class: 'playfield', style: { background: 'radial-gradient(180px 120px at 50% -30px, rgba(251,113,133,.14), transparent 70%)' } });
  scr.append(arena);
  const ring = countdownRing(0, 8000, 68);
  let solved = false, q = null, qTimer = null;

  sfx.boss();

  function renderBossHUD() {
    const b = fight.boss;
    return el('div', { class: 'boss-stage' },
      el('div', { class: 'boss-face', id: 'boss-face', html: bossSVG(b) }),
      el('div', { class: 'hp-bar grow' },
        el('div', { class: 'lbl' }, el('span', { text: b.name }), el('span', { text: fa(fight.bossHp) + ' HP' })),
        el('div', { class: 'bar coral' }, el('i', { style: { width: (100 * fight.bossHp / b.hp) + '%' } })),
        el('div', { class: 'lbl', style: { marginTop: '6px' } }, el('span', { text: 'تو' }),
          el('span', { class: 'hearts' }, Array.from({ length: 3 }, (_, i) => el('i', { html: heartSVG(i < fight.playerHp, 14) })))),
        el('div', { class: 'bar lime' }, el('i', { style: { width: (100 * fight.playerHp / 3) + '%' } }))),
      el('div', { class: 'center', style: { flexShrink: '0' } },
        el('div', { class: 'vs-emblem', text: 'فاز ' + fa(fight.phase) }),
        el('div', { class: 'tiny muted', style: { marginTop: '4px' }, text: ['شناخت مفهوم', 'کاربرد', 'استدلال چندمرحله‌ای'][fight.phase - 1] })));
  }

  let wb = null;
  function renderQ() {
    solved = false;
    fight.run.chapterFilter = fight.boss.chapterId;
    q = soloNextQuestion(fight.run);
    arena.innerHTML = '';
    arena.append(renderBossHUD());
    ring.node.style.margin = '0 auto 4px';
    arena.append(ring.node);
    const built = buildQuestionScene(q, {
      indexLabel: 'فاز ' + fa(fight.phase) + ' · سؤال ' + fa(fight.run.answers.length + 1),
      progress: null,
    });
    const qcard = built.qcard;
    const opts = built.optsWrap;
    q.options.forEach((html, idx) => {
      opts.append(optButton(idx, html, () => pick(idx), q.family === 'comparison'));
    });
    const bar = el('div', { class: 'assist-bar' });
    arena.append(built.scene, bar);
    if (wb) wb.destroy();
    wb = built.attachWhiteboard(bar);
    ring.frame(fight.run.qEndsAt, fight.run.qTotalMs);
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { if (!solved) pick(null); }, fight.run.qEndsAt - Date.now() + 350);
  }

  function pick(idx) {
    if (solved) return;
    solved = true;
    const res = bossAnswer(fight, idx === null ? -1 : idx);
    const opts = [...arena.querySelectorAll('.opt')];
    const qcard = arena.querySelector('.qcard');
    opts.forEach((b, i) => {
      b.disabled = true;
      if (i === q.correctIndex) b.classList.add('correct');
      else if (i === idx) b.classList.add('wrong');
    });
    const face = arena.querySelector('#boss-face');
    if (res.correct) {
      sfx.bossHit();
      scoreFloat(arena, 1);
      burst(qcard);
      edgeFlash(scr, true);
      face && face.classList.add('boss-angry');
    } else {
      sfx.wrong();
      edgeFlash(scr, false);
    }
    setTimeout(() => {
      if (bossIsOver(fight)) {
        const fin = bossFinish(fight);
        if (fin.won) { sfx.bossDown(); confetti(); } else sfx.defeat();
        nav('results', { kind: 'boss', fight, fin, won: fin.won });
      } else {
        if (fight.answeredInPhase === 0 && fight.phase > 1) {
          sfx.boss();
          scr.append(modal({
            title: 'فاز ' + fa(fight.phase) + ': ' + ['شناخت مفهوم', 'کاربرد', 'استدلال چندمرحله‌ای'][fight.phase - 1],
            body: el('p', { text: 'غول قوی‌تر شد! سؤالها سخت‌تر می‌شوند.', style: { lineHeight: '2' } }),
            actions: [{ label: 'می‌جنگم!', cls: 'primary' }],
          }));
        }
        renderQ();
      }
    }, res.correct ? 650 : 1150);
  }

  renderQ();
  return { node: scr, cleanup() { ring.stop(); clearTimeout(qTimer); if (wb) wb.destroy(); gcWhiteboard([q?.id].filter(Boolean)); } };
}

export function bossSVG(boss) {
  const ink = '#0B1D33';
  const faces = {
    'boss-ch1': `<circle cx="40" cy="42" r="24" fill="${boss.color}" stroke="${ink}" stroke-width="4"/><path d="M20 30 L32 42 M60 30 L48 42" stroke="${ink}" stroke-width="5" stroke-linecap="round"/><circle cx="33" cy="40" r="4" fill="${ink}"/><circle cx="47" cy="40" r="4" fill="${ink}"/>`,
    'boss-ch2': `<path d="M14 60 Q40 8 66 60 Z" fill="${boss.color}" stroke="${ink}" stroke-width="4"/><circle cx="33" cy="38" r="5" fill="#fff" stroke="${ink}" stroke-width="2.5"/><circle cx="47" cy="38" r="5" fill="#fff" stroke="${ink}" stroke-width="2.5"/><circle cx="33" cy="38" r="2" fill="${ink}"/><circle cx="47" cy="38" r="2" fill="${ink}"/><path d="M36 50 L44 50 L40 56 Z" fill="${ink}"/>`,
    'boss-ch3': `<rect x="18" y="18" width="44" height="44" rx="10" fill="${boss.color}" stroke="${ink}" stroke-width="4" transform="rotate(8 40 40)"/><text x="40" y="52" text-anchor="middle" font-size="26" font-weight="900" fill="#fff" font-family="sans-serif">√</text>`,
    'boss-ch4': `<path d="M12 62 Q40 -6 68 62" fill="none" stroke="${boss.color}" stroke-width="9" stroke-linecap="round"/><path d="M12 62 Q40 -6 68 62" fill="none" stroke="${ink}" stroke-width="3" stroke-dasharray="4 6"/><circle cx="40" cy="35" r="5" fill="${ink}"/>`,
    'boss-ch5': `<ellipse cx="40" cy="40" rx="26" ry="20" fill="${boss.color}" stroke="${ink}" stroke-width="4"/><path d="M14 40 Q40 20 66 40 M14 40 Q40 60 66 40" stroke="${ink}" stroke-width="2.5" fill="none"/><circle cx="40" cy="40" r="4" fill="${ink}"/>`,
    'boss-ch6': `<rect x="16" y="16" width="48" height="48" rx="8" fill="${boss.color}" stroke="${ink}" stroke-width="4"/><text x="40" y="52" text-anchor="middle" font-size="24" font-weight="900" fill="#fff" font-family="sans-serif">n!</text>`,
    'boss-ch7': `<circle cx="40" cy="42" r="24" fill="${boss.color}" stroke="${ink}" stroke-width="4"/><path d="M28 36 Q34 30 40 36 M48 36 Q52 32 56 38" stroke="${ink}" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M30 50 Q40 44 52 52" stroke="${ink}" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M40 6 L44 18 L38 20 Z" fill="${boss.color}" stroke="${ink}" stroke-width="3"/>`,
  };
  return `<svg viewBox="0 0 80 76" width="96" height="96" xmlns="http://www.w3.org/2000/svg">${faces[boss.id] || faces['boss-ch1']}</svg>`;
}

// ================================================================ RESULTS (verdict scene)

export function resultsScreen(params) {
  const scr = el('div', { class: 'screen' });
  const scroll = el('div', { class: 'scroll no-nav', style: { paddingTop: '26px' } });
  scr.append(scroll);

  let title, verdictCls, heroArt, statBoxes = [], extra = [], vSub = '';

  if (params.kind === 'duel-online') {
    const won = params.won, draw = params.draw;
    title = draw ? 'مساوی!' : won ? 'پیروزی!' : 'باخت';
    verdictCls = draw ? 'draw' : won ? 'win' : 'lose';
    vSub = draw ? 'حریف هم‌قدرت بود' : won ? 'میدان مال توست' : 'دفعهٔ بعد بازی رو برمی‌گردونی';
    heroArt = `<div class="v-art">${mascotSVG(draw ? 'confused' : won ? 'victorious' : 'disappointed', 132)}</div>`;
    statBoxes = [
      { v: fa(params.myScore), k: 'امتیاز تو' },
      { v: fa(params.oppScore), k: 'امتیاز حریف' },
      { v: '+' + fa(params.xp), k: 'XP' },
    ];
    if (params.ratingChanges) {
      const meId = S().profile?.serverUserId;
      const delta = meId === params.players[0]?.userId ? params.ratingChanges.deltaA : params.ratingChanges.deltaB;
      extra.push(el('div', { class: 'row', style: { justifyContent: 'center' } },
        el('span', { class: 'pill ' + (delta >= 0 ? 'lime' : 'coral'), text: 'رده: ' + (delta >= 0 ? '+' : '') + fa(delta) })));
    }
    extra.push(el('button', {
      class: 'btn purple block big', text: 'بازی دوباره؟',
      onclick: async () => {
        const ack = await emitSock('match:rematch', { matchId: params.matchId });
        if (ack.ok && ack.allAccepted && ack.matchId) {
          nav('duel', { online: true, matchId: ack.matchId, opponent: params.opponent });
        } else if (ack.ok) {
          toast('درخواست بازی دوباره فرستاده شد — منتظر حریف');
        } else toast('الان نمی‌شود بازی دوباره کرد');
      },
    }));
  } else if (params.kind === 'duel-offline') {
    const d = params.duel, r = d.result;
    const myName = d.config.passAndPlay ? 'بازیکن ۱' : 'تو';
    const won = r.winner === 0, draw = r.winner === 0.5;
    title = draw ? 'مساوی!' : won ? (d.config.passAndPlay ? 'بازیکن ۱ برد!' : 'پیروزی!') : (d.config.passAndPlay ? 'بازیکن ۲ برد!' : 'باخت');
    verdictCls = draw ? 'draw' : won ? 'win' : 'lose';
    vSub = d.config.vsBot ? (won ? 'جبرو شکست خورد — ولی برمی‌گردد!' : 'جبرو این دور را برد') : '';
    heroArt = `<div class="v-art">${mascotSVG(won || draw ? 'celebrating' : 'disappointed', 132)}</div>`;
    statBoxes = [
      { v: fa(r.scores[0]), k: myName },
      { v: fa(r.scores[1]), k: d.config.passAndPlay ? 'بازیکن ۲' : 'ربات' },
      { v: '+' + fa(r.xpGain), k: 'XP' },
    ];
    extra.push(el('button', { class: 'btn primary block', text: 'بازی دوباره', onclick: () => nav('duel', { online: false, config: d.config }) }));
    checkAchievements({ type: 'duel-end', won, wasBehind: d.scores[0] < d.scores[1] && false });
  } else if (params.kind === 'boss') {
    const won = params.won;
    title = won ? 'غول شکست خورد!' : 'غول پیروز شد!';
    verdictCls = won ? 'win' : 'lose';
    vSub = won ? 'نشان غول‌کش باز شد' : 'دوباره تلاش کن — غول هنوز در میدان است';
    heroArt = `<div class="v-art">${bossSVG(params.fight.boss)}</div>`;
    statBoxes = [
      { v: fa(params.fight.run.score), k: 'امتیاز' },
      { v: fa(params.fight.run.correct), k: 'درست' },
      { v: '+' + fa(params.fin.xpGain), k: 'XP' },
    ];
    if (won) extra.push(el('div', { class: 'row', style: { justifyContent: 'center' } }, el('span', { class: 'pill gold', text: 'نشان غول‌کش باز شد!' })));
    extra.push(el('button', { class: 'btn primary block', text: 'بازگشت به میدان غول‌ها', onclick: () => nav('boss-list') }));
  } else {
    // solo
    const run = params.run, res = params.res;
    const modeName = (SOLO_MODES[params.mode] || SOLO_MODES.blitz).name;
    title = res.isRecord ? 'رکورد جدید!' : params.won ? 'آفرین!' : 'تمام شد';
    verdictCls = params.won || res.isRecord ? 'win' : 'draw';
    vSub = modeName + ' · ' + fa(run.correct) + ' پاسخ درست از ' + fa(run.answers.length);
    heroArt = `<div class="v-art">${mascotSVG(params.won || res.isRecord ? 'excited' : 'sleepy', 132)}</div>`;
    statBoxes = [
      { v: fa(run.score), k: 'امتیاز' },
      { v: fa(run.correct) + '/' + fa(run.answers.length), k: 'درست' },
      { v: Math.round(res.accuracy * 100) + '٪', k: 'دقت' },
    ];
    if (res.isRecord) extra.push(el('div', { class: 'row', style: { justifyContent: 'center' } }, el('span', { class: 'pill gold', text: 'رکورد شخصی جدید' })));
    extra.push(el('div', { class: 'row', style: { justifyContent: 'center' } },
      el('span', { class: 'pill lime', text: '+' + fa(res.xpGain) + ' XP' })));
    extra.push(el('button', {
      class: 'btn primary block', text: 'یک دست دیگر (' + modeName + ')',
      onclick: () => nav('solo', { mode: params.mode, chapterFilter: run.chapterFilter }),
    }));
  }

  // rematch: when the fresh match is created (both accepted), jump in
  const unsubRematch = params.kind === 'duel-online' ? on('srv:match:found', (fp) => {
    if (!fp.matchId) return;
    if (window.__maScreen !== 'results') return;
    sfx.matchStart();
    nav('duel', { online: true, matchId: fp.matchId, opponent: params.opponent });
  }) : null;

  scroll.append(
    el('div', { class: 'verdict ' + verdictCls },
      el('span', { class: 'v-rays' }),
      el('div', { html: heroArt }),
      el('div', { class: 'v-title', text: title }),
      vSub ? el('div', { class: 'v-sub', text: vSub }) : null),
    el('div', { class: 'stat-grid', style: { margin: '14px 0 12px' } },
      statBoxes.map(s => el('div', { class: 'stat-box' }, el('div', { class: 'v', text: s.v }), el('div', { class: 'k', text: s.k })))),
    ...extra,
    el('div', { style: { height: '10px' } }),
    el('button', { class: 'btn ghost block', text: 'بازگشت به خانه', onclick: () => nav('home') }));
  return { node: scr, cleanup() { unsubRematch && unsubRematch(); } };
}
