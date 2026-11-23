// MATH ARENA - learning & profile screens: practice path (chapter map),
// chapter detail, Get Better in 15, mistake notebook, AI helper,
// achievements, statistics, avatar customization, profile.
import { el, S, save, saveNow, fa, nav, on, emit, fmtDate, ratingName, chapterName, chapterColor } from './core.js';
import { sfx } from './audio.js';
import { icon, mascot, mascotSVG, avatarView, modal, toast, confetti, emptyState, screenScaffold, diffPill, secHead, xpRing } from './ui.js';
import { Api, isOnline, queueSession, autoSync } from './net.js';
import {
  ACHIEVEMENTS, BOSSES, weakestSkills, skillState,
  createGB15, gb15QuestionsFor, gb15AdvanceDifficulty, gb15Report, checkAchievements,
} from './game.js';
import { chapters, questionById, skillMeta, skillPool, pickFromPool, similarQuestion } from './data.js';
import { SOLO_MODES, bossSVG } from './screens-game.js';

// ================================================================ PRACTICE PATH

export function practiceScreen() {
  const s = S();
  const body = el('div', {});
  const syms = ['\u2211', '\u2220', '\u221A', 'x\u00B2', '\u0192', 'n!', '%'];
  body.append(el('div', { class: 'row', style: { gap: '10px', margin: '2px 0 12px' } },
    el('div', { style: { width: '52px', height: '52px', flexShrink: '0' } }, mascot('excited', 'idle', 52)),
    el('div', {},
      el('div', { class: 'h-sub', text: 'مسیر یادگیری — از مفهوم تا تسلط، فصل به فصل' }),
      el('div', { class: 'tiny muted', text: 'هر فصل: مفهوم، تمرین، سرعت، تسلط و نبرد غول' }))));
  for (const ch of chapters()) {
    const skills = skillIdsOfChapter(ch.number);
    const doneCount = skills.filter(sk => (s.mastery[sk]?.level || 0) >= 4).length;
    const pct = Math.round(100 * doneCount / skills.length);
    const bossDefeated = s.achievements.includes('boss-ch' + ch.number);
    const col = chapterColor(ch.id);
    body.append(el('div', {
      class: 'panel', style: { background: '#102A46', borderRight: `7px solid ${col}`, cursor: 'pointer' },
      onclick: () => nav('chapter', { chapterId: ch.id }),
    },
      el('div', { class: 'row', style: { gap: '10px' } },
        el('div', {
          style: {
            width: '48px', height: '48px', flexShrink: '0', borderRadius: '14px', background: col,
            border: '3px solid var(--ink)', display: 'grid', placeItems: 'center',
            color: '#fff', fontWeight: '900', fontSize: '19px', boxShadow: '0 3px 0 rgba(7,20,38,.85)',
          }, text: syms[ch.number - 1],
        }),
        el('div', { class: 'grow' },
          el('b', { text: 'فصل ' + fa(ch.number) + ': ' + ch.name }),
          el('div', { class: 'tiny muted', text: ch.intro }),
          el('div', { class: 'bar', style: { marginTop: '6px', maxWidth: '230px' } }, el('i', { style: { width: pct + '%', background: col } }))),
        el('div', { class: 'center', style: { flexShrink: '0' } },
          el('span', { class: 'pill ' + (pct === 100 ? 'lime' : ''), text: fa(pct) + '٪' }),
          el('div', { class: 'tiny muted', style: { marginTop: '4px' }, text: bossDefeated ? 'غول شکست‌خورده ✓' : '' })))));
  }
  return { node: screenScaffold({ active: 'play', body, back: 'home' }) };
}

function skillIdsOfChapter(n) {
  return chapters().flatMap(c => c.number === n ? c.lessons.flatMap(l => l.skills) : []);
}

export function chapterScreen(params) {
  const s = S();
  const ch = chapters().find(c => c.id === params.chapterId);
  const body = el('div', {});
  const nodeTypes = [
    { id: 'concept', t: 'آشنایی با مفهوم', ico: '📖' },
    { id: 'practice', t: 'تمرین', ico: '✏️' },
    { id: 'speed', t: 'چالش سرعت', ico: '⚡' },
    { id: 'mastery', t: 'آزمون تسلط', ico: '🎓' },
    { id: 'boss', t: 'نبرد غول', ico: '👹' },
  ];

  for (const lesson of ch.lessons) {
    const lessonSkills = lesson.skills;
    const avgLevel = lessonSkills.reduce((a, sk) => a + (s.mastery[sk]?.level || 0), 0) / lessonSkills.length;
    body.append(el('div', { class: 'card' },
      el('div', { class: 'row between' },
        el('b', { text: lesson.name }),
        el('span', { class: 'pill ' + (avgLevel >= 4 ? 'lime' : avgLevel >= 2 ? 'blue' : ''), text: 'تسلط ' + fa(Math.round(avgLevel)) + '/۵' })),
      el('div', { class: 'tiny muted', text: 'صفحهٔ ' + fa(lesson.sourcePages[0]) + ' تا ' + fa(lesson.sourcePages[1]) + ' کتاب' }),
      el('div', { class: 'path-map', style: { marginTop: '10px' } },
        nodeTypes.map((nt, i) => {
          const unlocked = i === 0 || avgLevel >= [0, 1, 2, 3, 4][i];
          const stars = Math.min(3, Math.floor(avgLevel - i + 1));
          return el('div', {},
            el('button', {
              class: 'path-node ' + (unlocked ? (avgLevel >= i + 1.5 ? 'done' : 'next') : 'locked'),
              onclick: () => {
                if (!unlocked) { toast('اول تمرین‌های قبلی را قوی کن!'); return; }
                sfx.tap();
                if (nt.id === 'boss') { nav('boss', { bossId: 'boss-' + ch.id }); return; }
                const modeMap = { concept: 'precision', practice: 'survivalPractice', speed: 'blitz', mastery: 'precision' };
                nav('solo', { mode: modeMap[nt.id], chapterFilter: ch.id });
              },
            },
              el('span', { class: 'stars', text: '★'.repeat(Math.max(0, stars)) }),
              el('span', { class: 'ico', text: nt.ico }),
              nt.t),
            i < nodeTypes.length - 1 && el('div', { class: 'connector' }));
        }))));
  }
  body.append(el('button', {
    class: 'btn coral block big', text: 'نبرد با غول فصل ←',
    onclick: () => nav('boss', { bossId: 'boss-' + ch.id }),
  }));
  return { node: screenScaffold({ active: 'play', title: 'فصل ' + fa(ch.number) + ': ' + ch.name, body, back: 'practice' }) };
}

// ================================================================ BOSS LIST

export function bossListScreen() {
  const s = S();
  const body = el('div', {});
  body.append(el('div', { class: 'row', style: { gap: '10px', margin: '2px 0 12px' } },
    el('div', { style: { width: '54px', height: '54px', flexShrink: '0' } }, mascot('competitive', 'idle', 54)),
    el('div', {},
      el('div', { class: 'h-sub', text: 'هفت غولِ هفت فصل' }),
      el('div', { class: 'tiny muted', text: 'هر کدام سه فاز دارند و هر اشتباه یک جان تو می‌گیرد!' }))));
  for (const b of BOSSES) {
    const defeated = s.achievements.includes('boss-' + b.chapterId);
    body.append(el('div', {
      class: 'panel', style: {
        background: `linear-gradient(135deg, ${b.color}, ${b.color}CC 60%, ${b.color}99)`,
        color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px',
      },
      onclick: () => nav('boss', { bossId: b.id }),
    },
      el('div', {
        class: 'boss-face',
        style: {
          width: '74px', height: '74px', flexShrink: '0', background: '#102A46', borderRadius: '50%',
          display: 'grid', placeItems: 'center', border: '3px solid var(--ink)', boxShadow: '0 3px 0 rgba(7,20,38,.6)',
        }, html: bossSVG(b),
      }),
      el('div', { class: 'grow' },
        el('b', { style: { fontSize: '16.5px', textShadow: '0 2px 0 rgba(7,20,38,.35)' }, text: b.name }),
        el('div', { class: 'tiny', style: { opacity: '.95', fontWeight: 700 }, text: b.desc }),
        el('div', { class: 'chip-row', style: { marginTop: '5px' } },
          el('span', { class: 'pill', style: { fontSize: '10.5px', background: '#FFFFFF', fontWeight: 900 }, text: '۳ فاز' }),
          el('span', { class: 'pill coral', style: { fontSize: '10.5px' }, text: '۳ جان تو' }))),
      defeated
        ? el('span', { class: 'pill lime', text: 'شکست خورد ✓' })
        : el('span', { class: 'pill gold', text: 'نبرد!' })));
  }
  return { node: screenScaffold({ active: 'play', body, back: 'home' }) };
}

// ================================================================ GB15

export function gb15Screen() {
  const session = createGB15();
  const phaseNames = ['تشخیص', 'تمرین هدفمند', 'چالش زمانی', 'بررسی اشتباه‌ها', 'آزمون مجدد', 'گزارش'];
  const scr = el('div', { class: 'screen' });
  const arena = el('div', { class: 'scroll no-nav', style: { padding: '16px' } });
  scr.append(arena);

  function phaseBar() {
    return el('div', { class: 'gb15-phases' },
      Array.from({ length: 6 }, (_, i) => el('div', { class: 'gb15-ph ' + (i < session.phase ? 'done' : i === session.phase ? 'cur' : '') })));
  }

  function header() {
    return el('div', {},
      phaseBar(),
      el('div', { class: 'row between' },
        el('h2', { class: 'h-title', text: 'بهتر شو در ۱۵' }),
        el('span', { class: 'pill purple', text: phaseNames[session.phase] })),
      el('div', { class: 'tiny muted', style: { marginBottom: '10px' }, text: phaseDesc(session.phase) }));
  }

  function phaseDesc(p) {
    return [
      'با چند سؤال کوتاه نقاط ضعفت را پیدا می‌کنیم',
      'روی ضعیف‌ترین مهارت‌هایت تمرین هدفمند می‌کنیم',
      'یک چالش سرعتی کوتاه، مهارت‌ها را محک می‌زند',
      'اشتباه‌های امروز را مرور و اصلاح می‌کنیم',
      'با سؤال‌های هم‌سطحِ جدید، پیشرفت را می‌سنجم',
      'نتیجهٔ تلاش امروزت را ببین',
    ][p];
  }

  function askQuestions(questions, onAnswer, { label } = {}) {
    let i = 0;
    const list = el('div', {});
    const stats = { correct: 0, times: [] };
    function renderQ() {
      list.innerHTML = '';
      if (i >= questions.length) { onAnswer(stats); return; }
      const q = questions[i];
      const t0 = Date.now();
      list.append(
        el('div', { class: 'card', style: { '--chc': 'var(--purple)' } },
          el('div', { class: 'meta row', style: { gap: '6px' } },
            el('span', { class: 'pill blue', text: q.skillName }),
            diffPill(q.difficulty),
            el('span', { class: 'pill', text: fa(i + 1) + '/' + fa(questions.length) })),
          el('div', { class: 'qtext center', style: { padding: '12px 0' }, html: q.question })),
        el('div', { class: 'options' },
          q.options.map((html, idx) => el('button', {
            class: 'opt',
            html: `<span class="idx">${fa(idx + 1)}</span><span>${html}</span>`,
            onclick: (e) => {
              const correct = idx === q.correctIndex;
              if (correct) { sfx.correct(); stats.correct++; } else sfx.wrong();
              stats.times.push(Date.now() - t0);
              // record progress + mistakes
              import('./game.js').then(({ recordAnswer }) => recordAnswer(q, correct, idx, Date.now() - t0));
              [...list.querySelectorAll('.opt')].forEach((b, bi) => {
                b.disabled = true;
                if (bi === q.correctIndex) b.classList.add('correct');
                else if (bi === idx) b.classList.add('wrong');
              });
              setTimeout(() => { i++; renderQ(); }, correct ? 600 : 1400);
            },
          }))));
    }
    renderQ();
    return list;
  }

  function runTimedChallenge() {
    import('./game.js').then(({ createSoloRun, soloNextQuestion, soloAnswer, soloIsOver }) => {
      const run = createSoloRun({ mode: 'blitz', durationSec: 60 });
      let q = null, solved = false;
      const timeLeft = el('div', { class: 'pill gold', text: '۶۰' });
      const scorePill = el('div', { class: 'pill purple', text: 'امتیاز ۰' });
      const t0 = Date.now();
      const iv = setInterval(() => {
        const left = Math.max(0, 60 - Math.floor((Date.now() - t0) / 1000));
        timeLeft.textContent = fa(left);
        if (left <= 0) { clearInterval(iv); end(); }
      }, 250);
      function end() {
        clearInterval(iv);
        session.timed = { score: run.score, correct: run.correct, total: run.answers.length };
        sfx.stage();
        session.phase = 3;
        render();
      }
      function renderQ() {
        solved = false;
        q = soloNextQuestion(run);
        arena.innerHTML = '';
        arena.append(header(),
          el('div', { class: 'row', style: { justifyContent: 'center', gap: '6px' } }, timeLeft, scorePill),
          el('div', { class: 'card' },
            el('div', { class: 'row', style: { gap: '6px' } }, el('span', { class: 'pill blue', text: q.skillName }), diffPill(q.difficulty)),
            el('div', { class: 'qtext', style: { padding: '8px 0' }, html: q.question })),
          el('div', { class: 'options' }, q.options.map((html, idx) => el('button', {
            class: 'opt', html: `<span class="idx">${fa(idx + 1)}</span><span>${html}</span>`,
            onclick: () => {
              if (solved) return;
              solved = true;
              const res = soloAnswer(run, idx);
              import('./game.js').then(({ recordAnswer }) => recordAnswer(q, res.correct, idx, 500));
              [...arena.querySelectorAll('.opt')].forEach((b, i) => {
                b.disabled = true;
                if (i === q.correctIndex) b.classList.add('correct');
                else if (i === idx) b.classList.add('wrong');
              });
              scorePill.textContent = 'امتیاز ' + fa(run.score);
              if (res.correct) sfx.correct(); else sfx.wrong();
              setTimeout(() => { if (60 - (Date.now() - t0) / 1000 > 0) renderQ(); }, res.correct ? 450 : 1000);
            },
          }))));
      }
      sfx.matchStart();
      renderQ();
    });
  }

  function render() {
    arena.innerHTML = '';
    arena.append(header());

    if (session.phase === 0) {
      const qs = gb15QuestionsFor(session, 'diag');
      session.diag.questions = qs;
      arena.append(el('p', { class: 'tiny muted' }, 'پنج سؤال هم‌سطح — فقط برای تشخیص؛ نگران نتیجه نباش!'),
        askQuestions(qs, (stats) => {
          session.diag.answers = qs.map((q, i) => null); // filled during ask
          session.phase = 1;
          sfx.stage();
          render();
        }));
    } else if (session.phase === 1) {
      const qs = gb15QuestionsFor(session, 'practice');
      arena.append(el('div', { class: 'card tight' },
        el('b', { class: 'tiny', text: 'مهارت‌های هدف امروز: ' + session.targetSkills.map(id => skillMeta(id)?.name || id).slice(0, 3).join('، ') }),
        el('div', { class: 'tiny muted', text: 'سطح هدف: ' + fa(session.targetDifficulty) + ' (تطبیقی)' })),
        askQuestions(qs, () => { session.phase = 2; sfx.stage(); render(); }));
    } else if (session.phase === 2) {
      // inline 60-second timed challenge (stays inside the GB15 session)
      arena.append(el('p', { class: 'tiny muted' }, '۶۰ ثانیه — هرچه می‌توانی درست جواب بده!'));
      arena.append(el('button', {
        class: 'btn primary big block', text: 'شروع چالش زمانی ⏱',
        onclick: () => runTimedChallenge(),
      }));
    } else if (session.phase === 3) {
      const s = S();
      const open = s.mistakes.filter(m => !m.fixed).slice(0, 6);
      if (!open.length) {
        arena.append(emptyState('cheer', 'اشتباه بازیابی‌نشده‌ای نداری!', 'عالی پیش می‌روی'));
      }
      for (const m of open) {
        const q = questionById(m.qid);
        if (!q) continue;
        arena.append(el('div', { class: 'panel paper mistake-item' },
          el('div', { class: 'qtext', style: { fontSize: '16px' }, html: q.question }),
          el('div', { class: 'tiny muted', text: 'پاسخ تو: ' + (q.options[m.chosen] || '—') }),
          el('div', { class: 'solution-sheet', html: `<span class="lbl">پاسخ درست:</span> گزینهٔ ${fa(q.correctIndex + 1)} — ${q.solution}` }),
          el('button', {
            class: 'btn small lime', text: 'حل یک سؤال مشابه',
            onclick: () => {
              const sq = similarQuestion(q);
              if (!sq) { toast('سؤال مشابه بیشتری نیست'); return; }
              nav('gb15-variant', { questionId: sq.id, mistakeQid: q.id, backToGb15: true });
            },
          })));
      }
      arena.append(el('button', {
        class: 'btn primary block', text: 'مرور کردم — ادامه ←',
        onclick: () => { session.reviewedMistakes = open.length; session.phase = 4; render(); },
      }));
    } else if (session.phase === 4) {
      const qs = gb15QuestionsFor(session, 'retest');
      session.retest.questions = qs;
      arena.append(el('p', { class: 'tiny muted' }, 'سؤال‌های جدید اما هم‌سطح با آزمون اول — ببین چقدر بهتر شدی!'),
        askQuestions(qs, () => { session.phase = 5; sfx.victory(); render(); }));
    } else {
      const rep = gb15Report(session);
      const accDelta = Math.round(100 * rep.delta.accuracy);
      arena.append(
        el('div', { class: 'card center' },
          mascot(rep.delta.accuracy >= 0 ? 'celebrating' : 'thinking', 'happy', 110),
          el('h3', { class: 'h-display', text: accDelta >= 0 ? '+' + fa(accDelta) + '٪ دقت!' : fa(accDelta) + '٪ دقت' }),
          el('p', { class: 'tiny muted', text: 'این عدد از مقایسهٔ واقعی پاسخ‌های قبل و بعد به دست آمده — بدون خلاف واقع' })),
        el('div', { class: 'card' },
          el('b', { text: 'مقایسهٔ واقعی' }),
          el('div', { class: 'stat-grid', style: { marginTop: '8px' } },
            el('div', { class: 'stat-box' }, el('div', { class: 'v', text: Math.round(rep.before.accuracy * 100) + '٪' }), el('div', { class: 'k', text: 'دقت اول' })),
            el('div', { class: 'stat-box' }, el('div', { class: 'v', text: Math.round(rep.after.accuracy * 100) + '٪' }), el('div', { class: 'k', text: 'دقت آخر' })),
            el('div', { class: 'stat-box' }, el('div', { class: 'v', text: fa(Math.round((rep.after.avgMs || 0) / 1000)) + 'ث' }), el('div', { class: 'k', text: 'میانگین زمان' }))),
        rep.nextSkill && el('div', { class: 'card' },
          el('b', { text: 'قدم بعدی تو' }),
          el('p', { class: 'tiny', style: { lineHeight: '2' }, text: `مهارت «${rep.nextSkill.name}» را برای جلسهٔ بعد تمرین کن: ${rep.nextSkill.concept}` }))),
        el('button', {
          class: 'btn primary big block', text: 'پایان جلسه 🎉',
          onclick: () => {
            checkAchievements({ type: 'gb15-end' });
            queueSession({ sessionId: 'gb15-' + session.id, mode: 'gb15', correct: 0, total: 0, startedAt: session.startedAt });
            autoSync();
            confetti();
            nav('home');
          },
        }));
    }
  }
  render();
  return { node: scr };
}

/** Single similar-variant question screen (mistake retry). */
export function gb15VariantScreen(params) {
  const q = questionById(params.questionId);
  const body = el('div', {});
  if (!q) {
    body.append(emptyState('search', 'سؤال پیدا نشد'));
  } else {
    const t0 = Date.now();
    body.append(
      el('div', { class: 'card' },
        el('div', { class: 'meta row', style: { gap: '6px' } }, el('span', { class: 'pill blue', text: q.skillName }), diffPill(q.difficulty)),
        el('div', { class: 'qtext', style: { padding: '10px 0' }, html: q.question })),
      el('div', { class: 'options' }, q.options.map((html, idx) => el('button', {
        class: 'opt', html: `<span class="idx">${fa(idx + 1)}</span><span>${html}</span>`,
        onclick: () => {
          const correct = idx === q.correctIndex;
          import('./game.js').then(({ recordAnswer }) => recordAnswer(q, correct, idx, Date.now() - t0));
          [...body.querySelectorAll('.opt')].forEach((b, i) => {
            b.disabled = true;
            if (i === q.correctIndex) b.classList.add('correct');
            else if (i === idx) b.classList.add('wrong');
          });
          if (correct) { sfx.correct(); toast('آفرین! اشتباه اصلاح شد ✓'); }
          else sfx.wrong();
          setTimeout(() => nav(params.backToGb15 ? 'gb15' : 'mistakes'), 1200);
        },
      }))));
  }
  return { node: screenScaffold({ active: 'play', title: 'تلاش دوباره', body, noNav: true, back: 'mistakes' }) };
}

// ================================================================ MISTAKES

export function mistakesScreen() {
  const s = S();
  const body = el('div', {});
  const open = s.mistakes.filter(m => !m.fixed);
  const fixed = s.mistakes.filter(m => m.fixed);
  body.append(el('div', { class: 'panel paper row' },
    el('div', { class: 'list-ico', style: { background: '#FF5D73' }, html: icon('book', 18, '#fff') }),
    el('div', { class: 'grow' },
      el('b', { class: 'tiny', text: 'دفتر اشتباهات' }),
      el('div', { class: 'tiny muted', text: fa(open.length) + ' در انتظار اصلاح · ' + fa(fixed.length) + ' اصلاح‌شده' }))));
  if (!open.length) {
    body.append(emptyState('cheer', 'اشتباه بازیابی‌نشده‌ای نداری!', 'هر اشتباه اینجا فرصت یادگیری است'));
  }
  for (const m of open.slice(0, 40)) {
    const q = questionById(m.qid);
    if (!q) continue;
    const TYPE_NAMES = { 'sign-or-order': 'علامت/جابه‌جایی', formula: 'فرمول', 'missing-step': 'مرحلهٔ جاافتاده', arithmetic: 'محاسبه', concept: 'مفهوم', judgment: 'قضاوت', 'error-spotting': 'خطایابی' };
    const famInfo = (q.family && q.family !== 'direct') ? (q.familyLabel || q.family) + ' · ' : '';
    const tierInfo = q.tierLabel || '';
    const myFb = (Array.isArray(q.optionFeedback) && m.chosen != null && q.optionFeedback[m.chosen])
      ? `<div class="optfb"><span class="lbl">خطای انتخاب تو</span> ${q.optionFeedback[m.chosen]}</div>` : '';
    body.append(el('div', { class: 'panel paper mistake-item' },
      el('div', { class: 'row between' },
        el('span', { class: 'pill blue', style: { fontSize: '10px' }, text: q.skillName }),
        el('span', { class: 'tiny muted', text: (m.mistakeType ? ('الگو: ' + (TYPE_NAMES[m.mistakeType] || m.mistakeType) + ' · ') : '') + fmtDate(m.ts) })),
      el('div', { class: 'qtext', style: { fontSize: '15px', margin: '8px 0' }, html: q.question }),
      el('div', { class: 'tiny muted', text: 'پاسخ تو: ' + (q.options[m.chosen] || 'بی‌پاسخ') }),
      el('div', { class: 'solution-sheet', html: `${myFb}<span class="lbl">پاسخ درست:</span> گزینهٔ ${fa(q.correctIndex + 1)} — ${q.solution}` }),
      el('div', { class: 'row', style: { marginTop: '8px' } },
        el('button', {
          class: 'btn small lime grow', text: 'سؤال مشابه را حل کن',
          onclick: () => {
            const sq = similarQuestion(q);
            if (sq) nav('gb15-variant', { questionId: sq.id });
            else toast('برای این مهارت سؤال مشابه بیشتری نداریم');
          },
        }),
        el('button', {
          class: 'btn small ghost', text: 'درخواست توضیح',
          onclick: () => nav('ai-helper', { questionId: q.id, chosen: m.chosen }),
        }))));
  }
  return { node: screenScaffold({ active: 'play', title: 'دفتر اشتباهات', body, back: 'home' }) };
}

// ================================================================ AI HELPER

export function aiHelperScreen(params) {
  const s = S();
  const scr = el('div', { class: 'screen' });
  const wrap = el('div', { class: 'chat-wrap' });
  const scroll = el('div', { class: 'chat-scroll' });
  const input = el('input', { type: 'text', placeholder: 'سؤالت را بپرس...' });
  const mode = isOnline() ? 'server' : 'local';

  function bubble(text, me = false, suggestions = []) {
    const b = el('div', { class: 'bubble ' + (me ? 'me' : 'ai') });
    b.innerHTML = text;
    if (suggestions.length) {
      b.append(el('div', { class: 'sugg' },
        suggestions.map(sg => el('button', {
          class: 'btn small', text: sg,
          onclick: () => { input.value = sg; send(); },
        }))));
    }
    scroll.append(b);
    scroll.scrollTop = scroll.scrollHeight;
    return b;
  }

  const q = params.questionId ? questionById(params.questionId) : null;

  async function localTutor(text) {
    // deterministic offline tutor built from the verified bank
    if (!q) {
      if (/توضیح|مفهوم|چیست|یعنی/.test(text)) {
        const weak = weakestSkills(1)[0];
        return {
          text: `سلام! من دستیارِ آفلاین میدانم (حالت قطعی، بدون هوش مصنوعی آنلاین).\n` +
            `پیشنهاد من برای شروع: «${weak?.skill?.name || 'تمرین عمومی'}» — ${weak?.skill?.concept || ''}\n` +
            `می‌توانی یک سؤال باز کنی و از من بخواهی راهنمایی یا راه‌حل بدهم.`,
          sugg: ['بهتر شو در ۱۵ چطور کار می‌کند؟', 'ضعیف‌ترین مهارتم چیست؟'],
        };
      }
      if (/ضعیف|پیشنهاد|تمرین/.test(text)) {
        const weak = weakestSkills(3);
        return {
          text: 'بر اساس پاسخ‌های واقعی تو، این مهارت‌ها نیاز به تمرین دارند:\n' +
            weak.map(w => `• ${w.skill.name} (سطح تسلط ${fa(w.level)}/۵)`).join('\n') +
            '\nبا «بهتر شو در ۱۵» روی همین‌ها کار می‌کنیم.',
          sugg: ['شروع بهتر شو در ۱۵'],
        };
      }
      return {
        text: 'من در حالت آفلاین روی سؤال‌های ریاضی جواب می‌دهم. یک سؤال باز کن (مثلاً از دفتر اشتباهات یا مسیر تمرین) یا بپرس «ضعیف‌ترین مهارتم چیست؟»',
        sugg: ['ضعیف‌ترین مهارتم چیست؟'],
      };
    }
    if (/چرا|غلط|اشتباه/.test(text)) {
      return {
        text: `مفهوم اصلی: ${q.conceptExplanation}\nنکته: ${q.conceptHint}\n` +
          `اشتباه رایج: ${q.commonMistake}\nمی‌خواهی راه‌حل کامل را ببینی؟`,
        sugg: ['راه‌حل کامل', 'سؤال مشابه بده'],
      };
    }
    if (/راهنمایی|کمک|سرنخ/.test(text)) {
      return { text: `سرنخ: ${q.conceptHint}\nاول با همین سرنخ امتحان کن!`, sugg: ['راه‌حل کامل'] };
    }
    if (/مشابه|تمرین جدید|یک سؤال دیگه/.test(text)) {
      const sq = similarQuestion(q);
      if (sq) {
        setTimeout(() => {
          bubble('سؤال مشابه — خودت حل کن و بعد از پاسخ دادن، نتیجه را ببین:\n' +
            sq.question.replace(/<[^>]+>/g, ' '), false,
            ['برو به این سؤال', 'راه‌حل همین سؤال قبلی را بگو']);
          const goTo = scroll.lastElementChild.querySelector('.btn');
          goTo && goTo.addEventListener('click', () => nav('gb15-variant', { questionId: sq.id }));
        }, 300);
        return { text: 'یک سؤال مشابه برایت آماده کردم ↓' };
      }
    }
    return {
      text: `راه‌حل گام‌به‌گام:\n${q.solution}\n\nتوضیح مفهوم: ${q.conceptExplanation}`,
      sugg: ['سؤال مشابه بده'],
    };
  }

  async function send() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    bubble(text, true);
    sfx.tap();
    if (mode === 'server') {
      try {
        const r = await Api.aiChat([{ role: 'user', content: text }], {
          questionId: q?.id, skillId: params.skillId,
        });
        if (r.ok) bubble(r.reply, false, r.suggestions || []);
        else bubble('الان نمی‌توانم جواب بدهم: ' + (r.error === 'rate-limited' ? 'محدودیت تعداد پیام' : 'خطا'));
      } catch (e) {
        bubble('ارتباط با سرور برقرار نشد — جواب آفلاین می‌دهم:\n' + (await localTutor(text)).text);
      }
    } else {
      const r = await localTutor(text);
      bubble(r.text, false, r.sugg || []);
    }
  }

  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });

  wrap.append(
    el('div', { class: 'ai-mode-banner' },
      mode === 'server' ? 'دستیار هوشمند (متصل به سرور)' : 'دستیار آفلاین — حالت قطعی مبتنی بر کتاب؛ هوش مصنوعی آنلاین فعال نیست'),
    scroll,
    el('div', { class: 'chat-input' },
      input,
      el('button', { class: 'btn primary', text: 'ارسال', onclick: send })));
  scr.append(wrap);

  // welcome
  bubble(
    q
      ? `سلام! روی این سؤال کار می‌کنیم:\n${q.question.replace(/<[^>]+>/g, ' ')}\nبگو «راهنمایی» تا قدم‌به‌قدم جلو برویم.`
      : 'سلام! من دستیار ریاضی میدانم. سؤالی داری؟ یا بگو «ضعیف‌ترین مهارتم چیست؟»',
    false,
    q ? ['راهنمایی', 'چرا جوابم غلط است؟', 'راه‌حل کامل', 'سؤال مشابه بده'] : ['ضعیف‌ترین مهارتم چیست؟', 'بهتر شو در ۱۵ چطور کار می‌کند؟']);

  return { node: scr };
}

// ================================================================ ACHIEVEMENTS

export function achievementsScreen() {
  const s = S();
  const body = el('div', {});
  const unlocked = new Set(s.achievements);
  body.append(el('div', { class: 'panel paper' },
    el('div', { class: 'row between' },
      el('b', { text: fa(unlocked.size) + ' از ' + fa(ACHIEVEMENTS.length) + ' دستاورد' }),
      el('span', { class: 'pill purple', text: Math.round(100 * unlocked.size / ACHIEVEMENTS.length) + '٪' })),
    el('div', { class: 'bar purple', style: { marginTop: '8px' } }, el('i', { style: { width: (100 * unlocked.size / ACHIEVEMENTS.length) + '%' } }))));
  const grid = el('div', { class: 'grid2' });
  for (const a of ACHIEVEMENTS) {
    const has = unlocked.has(a.id);
    grid.append(el('div', {
      class: 'panel tight center', style: has ? { background: '#FFF3D6' } : { background: '#F2EDE2', opacity: '.75' },
    },
      el('div', {
        style: {
          width: '46px', height: '46px', margin: '4px auto 6px', borderRadius: '50%',
          border: '3px solid var(--ink)', background: has ? 'var(--gold)' : '#E2D9C6',
          display: 'grid', placeItems: 'center', boxShadow: has ? '0 3px 0 rgba(7,20,38,.5)' : 'none',
        },
        html: icon(a.icon, 22, has ? '#1E2A4A' : '#56698A'),
      }),
      el('b', { class: 'tiny', text: a.name }),
      el('div', { class: 'tiny muted', text: a.desc })));
  }
  body.append(grid);
  return { node: screenScaffold({ active: 'profile', title: 'دستاوردها', body }) };
}

// ================================================================ STATS

export function statsScreen() {
  const s = S();
  const st = s.stats;
  const acc = st.answered ? Math.round(100 * st.correct / st.answered) : 0;
  const avgSec = st.answered ? (st.timeMs / st.answered / 1000).toFixed(1) : 0;
  const body = el('div', {});

  // ---- headline stats
  body.append(
    el('div', { class: 'stat-grid' },
      el('div', { class: 'stat-box' }, el('div', { class: 'v', text: fa(st.answered) }), el('div', { class: 'k', text: 'سؤال' })),
      el('div', { class: 'stat-box' }, el('div', { class: 'v', style: { color: 'var(--good)' }, text: fa(acc) + '٪' }), el('div', { class: 'k', text: 'دقت کلی' })),
      el('div', { class: 'stat-box' }, el('div', { class: 'v', text: fa(avgSec) + 'ث' }), el('div', { class: 'k', text: 'میانگین زمان' })),
      el('div', { class: 'stat-box' }, el('div', { class: 'v', style: { color: 'var(--gold)' }, text: fa(s.progress.bestStreak || 0) }), el('div', { class: 'k', text: 'بهترین کمبو' })),
      el('div', { class: 'stat-box' }, el('div', { class: 'v', style: { color: 'var(--acc)' }, text: fa(s.progress.wins) }), el('div', { class: 'k', text: 'برد' })),
      el('div', { class: 'stat-box' }, el('div', { class: 'v', style: { color: 'var(--bad)' }, text: fa(s.mistakes.filter(m => !m.fixed).length) }), el('div', { class: 'k', text: 'اشتباه باز' }))));

  // ---- per-concept performance (all 38 concepts, data-honest)
  const skillRows = chapters().flatMap(ch =>
    ch.lessons.flatMap(ls => ls.skills.map(skid => ({ skid, ls }))));
  const conceptData = skillRows.map(({ skid, ls }) => {
    const meta = skillMeta(skid);
    const c = st.bySkill[skid] || { correct: 0, total: 0 };
    const m = s.mastery[skid] || { level: 0, due: 0 };
    return {
      skid, name: meta ? meta.name : skid, lesson: ls.name,
      total: c.total, acc: c.total ? c.correct / c.total : null,
      level: m.level || 0, due: m.due && m.due < Date.now(),
      page: (meta && meta.sourcePages) ? meta.sourcePages[0] : null,
    };
  });
  const withData = conceptData.filter(r => r.total > 0);
  const sorted = withData.slice().sort((a, b) => (a.acc || 0) - (b.acc || 0));

  body.append(secHead('عملکرد به تفکیک مفهوم', { accent: 'var(--acc)', count: fa(withData.length) + ' مفهوم دارای داده' }));
  const conceptPanel = el('div', { class: 'panel paper col', style: { gap: '9px' } });
  if (!withData.length) {
    conceptPanel.append(el('div', { class: 'tiny muted center', text: 'هنوز داده‌ای ثبت نشده — چند مسابقه بازی کن تا نمودار مفاهیم شکل بگیرد.' }));
  }
  for (const r of sorted.slice(0, 12)) {
    const p = Math.round((r.acc || 0) * 100);
    conceptPanel.append(el('div', {},
      el('div', { class: 'row between tiny' },
        el('span', { text: r.name, style: { fontWeight: '600' } }),
        el('span', { class: 'muted', text: fa(p) + '٪ · ' + fa(r.total) + ' سؤال · تسلط ' + fa(r.level) + ' از ۵' + (r.due ? ' · مرورش رسیده' : '') })),
      el('div', { class: 'bar' }, el('i', { style: { width: p + '%', background: p >= 70 ? 'var(--good)' : p >= 45 ? 'var(--gold)' : 'var(--bad)' } }))));
  }
  body.append(conceptPanel);
  if (withData.length > 12) {
    body.append(el('div', { class: 'tiny muted center', text: fa(withData.length - 12) + ' مفهوم دیگر با دادهٔ کمتر' }));
  }

  // ---- difficulty-tier accuracy (reasoning depth)
  body.append(secHead('دقت به تفکیک سطح سختی', { accent: 'var(--gold)' }));
  const tierPanel = el('div', { class: 'panel paper col', style: { gap: '8px' } });
  const TIER_NAMES = { 1: 'آسان (یک‌قدمی)', 2: 'متوسط (استنتاج)', 3: 'سخت (چندمرحله‌ای)', 4: 'خبره (ترکیبی)' };
  let anyTier = false;
  for (const t of [1, 2, 3, 4]) {
    const d = st.byDifficulty[String(t)] || st.byDifficulty[t];
    if (!d || !d.total) continue;
    anyTier = true;
    const p = Math.round(100 * d.correct / d.total);
    tierPanel.append(el('div', {},
      el('div', { class: 'row between tiny' },
        el('span', { text: TIER_NAMES[t] }),
        el('span', { class: 'muted', text: fa(p) + '٪ از ' + fa(d.total) + ' سؤال' })),
      el('div', { class: 'bar' }, el('i', { style: { width: p + '%', background: p >= 70 ? 'var(--good)' : p >= 45 ? 'var(--gold)' : 'var(--bad)' } }))));
  }
  if (!anyTier) tierPanel.append(el('div', { class: 'tiny muted center', text: 'داده‌ای برای سطح‌ها ثبت نشده است.' }));
  body.append(tierPanel);

  // ---- question-family accuracy (what KIND of reasoning slips)
  const FAM_NAMES = { conceptual: 'مفهومی', reverse: 'وارونه', 'error-id': 'خطایاب', 'multi-step': 'چندمرحله‌ای', application: 'کاربردی', comparison: 'قضاوت (همیشه/گاهی/هرگز)', challenge: 'چالشی', direct: 'مستقیم' };
  const famKeys = Object.keys(st.byFamily || {});
  if (famKeys.length) {
    body.append(secHead('دقت به تفکیک نوع سؤال', { accent: 'var(--violet)' }));
    const famPanel = el('div', { class: 'panel paper col', style: { gap: '8px' } });
    for (const f of famKeys) {
      const d = st.byFamily[f];
      if (!d || !d.total) continue;
      const p = Math.round(100 * d.correct / d.total);
      famPanel.append(el('div', {},
        el('div', { class: 'row between tiny' },
          el('span', { text: FAM_NAMES[f] || f }),
          el('span', { class: 'muted', text: fa(p) + '٪ از ' + fa(d.total) })),
        el('div', { class: 'bar' }, el('i', { style: { width: p + '%', background: p >= 70 ? 'var(--good)' : p >= 45 ? 'var(--gold)' : 'var(--bad)' } }))));
    }
    body.append(famPanel);
  }

  // ---- recurring mistake patterns
  const open = s.mistakes.filter(m => !m.fixed);
  const TYPE_NAMES = { 'sign-or-order': 'خطای علامت/جابه‌جایی', formula: 'کاربرد نادرست فرمول',
    'missing-step': 'جا افتادن یک مرحله', arithmetic: 'خطای محاسباتی', concept: 'خطای مفهومی',
    judgment: 'قضاوت نادرست گزاره', 'error-spotting': 'نیافتن گام غلط' };
  const byType = {};
  for (const m of open) {
    const t = m.mistakeType || 'concept';
    byType[t] = (byType[t] || 0) + 1;
  }
  const typeEntries = Object.entries(byType).sort((a, b) => b[1] - a[1]);
  if (typeEntries.length) {
    body.append(secHead('الگوی اشتباه‌های تکرارشونده', { accent: 'var(--bad)', count: fa(open.length) + ' اشتباه باز' }));
    const recPanel = el('div', { class: 'panel paper col', style: { gap: '8px' } });
    for (const [t, n] of typeEntries) {
      recPanel.append(el('div', { class: 'row between tiny' },
        el('span', { text: TYPE_NAMES[t] || t }),
        el('span', { class: 'pill ' + (n >= 3 ? 'coral' : ''), style: { fontSize: '11px' }, text: fa(n) + ' بار' })));
    }
    recPanel.append(el('div', { class: 'tiny muted', style: { borderTop: '1px solid var(--line)', paddingTop: '8px' },
      text: 'این طبقه‌بندی از توضیحِ اختصاصیِ هر گزینهٔ نادرست استخراج می‌شود، نه از حدس.' }));
    body.append(recPanel);
  }

  // ---- weakness-driven recommendations (no score inflation)
  body.append(secHead('توصیهٔ تمرین', { accent: 'var(--good)' }));
  const recPanel = el('div', { class: 'panel paper col', style: { gap: '10px' } });
  const weak = weakestSkills(3).filter(w => (st.bySkill[w.skill.id]?.total || 0) > 0 || w.level === 0);
  const mastered = conceptData.filter(r => r.level >= 4 && r.total >= 4);
  if (weak.length) {
    for (const w of weak) {
      const b = el('button', {
        class: 'rec-row', type: 'button',
        onclick: () => nav('chapter', { chapterId: 'ch' + w.skill.chapter }),
      });
      b.append(
        el('span', { class: 'rec-ico', html: icon('bolt', 18, 'var(--gold)') }),
        el('div', { class: 'grow' },
          el('div', { style: { fontWeight: '700' }, text: w.skill.name }),
          el('div', { class: 'tiny muted', text: 'تسلط ' + fa(w.level) + ' از ۵' + (w.due ? ' · زمان مرور رسیده' : '') + ' — چند سؤال «وارونه» و «خطایاب» از این مفهوم بزن' })));
      recPanel.append(b);
    }
  } else {
    recPanel.append(el('div', { class: 'tiny muted', text: 'هنوز نقطهٔ ضعف برجسته‌ای شناسایی نشده؛ بازی کن تا تحلیل دقیق‌تر شود.' }));
  }
  if (mastered.length) {
    recPanel.append(el('div', { class: 'tiny muted', style: { borderTop: '1px solid var(--line)', paddingTop: '8px' },
      text: 'مسلط‌شده و کنار گذاشته‌شده از تمرین تکراری: ' + mastered.map(m => m.name).join('، ') +
        ' — این مفاهیم در حالت‌های تمرینی دوباره پرسیده نمی‌شوند.' }));
  }
  body.append(recPanel);

  return { node: screenScaffold({ active: 'profile', title: 'آمار و پیشرفت', body }) };
}

// ================================================================ AVATAR EDITOR

export function avatarScreen() {
  const s = S();
  const body = el('div', {});
  const render = () => {
    body.innerHTML = '';
    body.append(
      el('div', { class: 'center', style: { margin: '6px 0' } },
        el('div', { id: 'av-big', style: { width: '130px', height: '130px', margin: '0 auto' } })),
      el('div', { class: 'card' },
        el('b', { text: 'شخصیت' }),
        el('div', { class: 'avatar-grid', style: { marginTop: '8px' } },
          [['fox', 'روباه'], ['cat', 'گربه'], ['owl', 'جغد'], ['bear', 'خرس'], ['robot', 'ربات'], ['dragon', 'اژدها']].map(([id, name]) =>
            el('button', {
              class: 'avatar-pick' + (s.profile.avatar.base === id ? ' sel' : ''),
              onclick: () => { s.profile.avatar.base = id; save(); sfx.tap(); render(); },
            }, el('div', { class: 'av', html: window.__ma_ui.avatarSVG(id, s.profile.avatar.color, 64) }), name))),
        el('b', { text: 'رنگ', style: { display: 'block', marginTop: '12px' } }),
        el('div', { class: 'color-dots', style: { marginTop: '8px' } },
          window.__ma_ui.AVATAR_COLORS.map(c => el('button', {
            class: 'color-dot' + (s.profile.avatar.color === c ? ' sel' : ''),
            style: { background: c },
            onclick: () => { s.profile.avatar.color = c; save(); sfx.tap(); render(); },
          }))),
        el('b', { text: 'قاب پروفایل', style: { display: 'block', marginTop: '12px' } }),
        el('div', { class: 'chip-row', style: { marginTop: '8px' } },
          (s.cosmetics.frames || ['default']).map(f =>
            el('button', {
              class: 'filter-chip' + (s.cosmetics.equippedFrame === f ? ' active' : ''), text: f === 'default' ? 'کلاسیک' : f,
              onclick: () => { s.cosmetics.equippedFrame = f; save(); },
            }))),
        el('b', { text: 'عنوان', style: { display: 'block', marginTop: '12px' } }),
        el('div', { class: 'chip-row', style: { marginTop: '8px' } },
          (s.cosmetics.titles || ['rookie']).map(t =>
            el('button', {
              class: 'filter-chip' + (s.cosmetics.equippedTitle === t ? ' active' : ''),
              text: t === 'rookie' ? 'تازه‌وارد' : t === 'champion' ? 'قهرمان' : t,
              onclick: () => { s.cosmetics.equippedTitle = t; save(); },
            })))));
    body.append(el('button', {
      class: 'btn primary block', text: 'ذخیره',
      onclick: async () => {
        saveNow();
        if (isOnline() && s.profile.token) {
          try {
            await Api.updateProfile({ name: s.profile.name, avatar: s.profile.avatar, cosmetics: s.cosmetics });
            toast('پروفایل آنلاین هم به‌روز شد');
          } catch (e) { /* offline ok */ }
        }
        nav('profile');
      },
    }));

    const big = body.querySelector('#av-big');
    if (big) big.innerHTML = window.__ma_ui.avatarSVG(s.profile.avatar.base, s.profile.avatar.color, 130);
  };
  render();
  return { node: screenScaffold({ active: 'profile', title: 'شخصی‌سازی آواتار', body, noNav: true, back: 'profile' }) };
}

// ================================================================ PROFILE

export function profileScreen() {
  const s = S();
  const p = s.profile || { name: 'مهمان', avatar: { base: 'fox', color: '#FF8A3D' } };
  const body = el('div', {});
  const lvl = s.progress.level;
  const xpNow = s.progress.xp;
  const xpNext = 50 * lvl * (lvl + 1);
  const xpPrev = 50 * (lvl - 1) * lvl;
  const pct = Math.round(100 * (xpNow - xpPrev) / Math.max(1, xpNext - xpPrev));
  const titleMap = { rookie: 'تازه‌وارد', champion: 'قهرمان' };
  const eqTitle = titleMap[s.cosmetics.equippedTitle] || s.cosmetics.equippedTitle;

  const wBadge = (bg, txt) => el('span', {
    style: { background: bg, border: '2.5px solid rgba(255,255,255,.65)', borderRadius: '999px', padding: '3px 11px', fontSize: '12px', fontWeight: '900', color: '#fff', whiteSpace: 'nowrap' },
    text: txt,
  });

  body.append(
    el('div', { class: 'card center', style: { background: 'linear-gradient(170deg,#163956,#0B1D33)', color: '#fff', paddingTop: '24px', overflow: 'hidden', position: 'relative' } },
      el('span', { style: { position: 'absolute', top: '-46px', left: '-46px', width: '150px', height: '150px', background: 'radial-gradient(circle, rgba(255,197,61,.3), transparent 70%)', borderRadius: '50%' } }),
      avatarView(p.avatar, 104),
      el('h2', { class: 'h-display', style: { margin: '8px 0 2px', color: '#fff' }, text: p.name }),
      el('div', { class: 'chip-row', style: { justifyContent: 'center', marginTop: '6px' } },
        wBadge('rgba(139,92,246,.85)', eqTitle),
        wBadge('rgba(255,197,61,.9)', 'سطح ' + fa(lvl)),
        wBadge('rgba(61,155,255,.85)', 'رده ' + fa(s.progress.soloRating) + ' — ' + ratingName(s.progress.soloRating))),
      el('div', { class: 'row', style: { justifyContent: 'center', gap: '10px', marginTop: '14px' } },
        el('div', { html: xpRing(lvl, pct, 62, '#FFC53D') }),
        el('div', { style: { textAlign: 'right' } },
          el('div', { style: { fontWeight: '900', fontSize: '15px' }, text: fa(xpNow) + ' XP' }),
          el('div', { class: 'tiny', style: { color: '#C8D4F2' }, text: 'تا سطح بعد ' + fa(xpNext - xpNow) + ' XP' }),
          el('div', { class: 'tiny', style: { color: '#C8D4F2' }, text: fa(s.progress.wins) + ' برد · ' + fa(s.progress.losses) + ' باخت' }))),
      p.friendCode ? el('div', { class: 'chip-row', style: { justifyContent: 'center', marginTop: '10px' } }, wBadge('rgba(53,196,181,.85)', 'کد دوستی: ' + p.friendCode)) : null),
    el('div', { class: 'grid2' },
      el('button', { class: 'btn blue', html: icon('profile', 18) + ' ویرایش آواتار', onclick: () => nav('avatar') }),
      el('button', { class: 'btn', html: icon('compass', 18) + ' آمار و پیشرفت', onclick: () => nav('stats') }),
      el('button', { class: 'btn purple', html: icon('medal', 18) + ' دستاوردها', onclick: () => nav('achievements') }),
      el('button', { class: 'btn lime', html: icon('trophy', 18) + ' جدول رتبه‌ها', onclick: () => nav('leaderboard') })),
    secHead('رکوردهای شخصی', { accent: 'var(--gold)' }),
    el('div', { class: 'panel paper' },
      el('div', { class: 'col tiny', style: { gap: '7px' } },
        Object.entries(s.records).map(([mode, r]) =>
          el('div', {
            class: 'row between', style: { background: '#102A46', borderRadius: '10px', padding: '7px 11px', border: '2px solid rgba(56,189,248,.10)' },
          },
            el('span', { style: { fontWeight: 900 }, text: (SOLO_MODES[mode] || { name: mode }).name }),
            el('b', { text: fa(r.score) + ' — ' + fmtDate(r.at) }))))),
    el('button', { class: 'btn ghost block small', text: 'تنظیمات', onclick: () => nav('settings') }),
    el('div', { class: 'tiny muted center', style: { padding: '2px 0 8px' }, text: 'میدان ریاضی — مسیرت ادامه دارد!' }));

  return { node: screenScaffold({ active: 'profile', title: 'پروفایل من', body }) };
}
