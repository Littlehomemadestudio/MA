// MATH ARENA - offline game engine: six-stage duel (vs bot / pass-and-play),
// solo modes (blitz, survival, marathon, precision, record), boss battles,
// learning engine (adaptive difficulty, spaced repetition, GB15).
import { S, save, addXp, uid, shuffle } from './core.js';
import { skillPool, chapterPool, pickTopics, pickFromPool, similarQuestion, questionById, getCurriculum, getBank } from './data.js';
import { emit as busEmit } from './core.js';

// ---------------- scoring (mirrors server formula) ----------------
export function scoreAnswer({ difficulty, remainingMs, totalMs, streak }) {
  const base = 100 + 50 * (Math.max(1, Math.min(4, difficulty)) - 1);
  const timeBonus = Math.round(40 * Math.max(0, Math.min(1, remainingMs / Math.max(1, totalMs))));
  const streakBonus = streak >= 2 ? Math.min(45, 15 * (streak - 1)) : 0;
  return base + timeBonus + streakBonus;
}

// ---------------- duel engine (offline) ----------------
// config: { vsBot: bool, botLevel: 1-5, passAndPlay: bool, chapterFilter, ranked(local casual) }
export function createOfflineDuel(config) {
  const seed = uid();
  const players = config.passAndPlay
    ? [{ id: 'p1', name: 'بازیکن ۱' }, { id: 'p2', name: 'بازیکن ۲' }]
    : [{ id: 'me', name: S().profile?.name || 'من' }, { id: 'bot', name: 'ربات جبرو' }];
  const duel = {
    seed, config, players,
    stage: 0, qIndex: -1, state: 'topic_pick',
    questions: [], topics: [], pickerIdx: 0,
    scores: [0, 0], streaks: [0, 0], corrects: [0, 0], wrongs: [0, 0],
    answered: [null, null], // {optionIndex, remainingMs}
    assists: [{ removeTwo: 1, thinkingTime: 1, conceptClue: 1 }, { removeTwo: 1, thinkingTime: 1, conceptClue: 1 }],
    removedOptions: [null, null], // for removeTwo per player
    perSkill: [{}, {}],
    startedAt: Date.now(), finishedAt: null, result: null,
    passTurnScreen: false, // pass-and-play turn hiding
    timers: [],
  };
  return duel;
}

export function duelStartStage(duel) {
  duel.stage += 1;
  duel.state = 'topic_pick';
  duel.qIndex = -1;
  if (duel.stage > 6) return duelFinish(duel);
  duel.topics = pickTopics(`${duel.seed}:${duel.stage}`, duel.config.chapterFilter);
  duel.pickerIdx = (duel.stage - 1) % 2;
  return { topics: duel.topics, picker: duel.pickerIdx, stage: duel.stage };
}

export function duelLockTopic(duel, skillId) {
  const pool = skillPool(skillId);
  duel.questions = pickFromPool(pool, 3, `${duel.seed}:${duel.stage}:${skillId}`);
  duel.state = 'question';
  duelDuelQuestion(duel, 0);
  return true;
}

function duelDuelQuestion(duel, idx) {
  duel.qIndex = idx;
  duel.state = 'question';
  duel.answered = [null, null];
  duel.removedOptions = [null, null];
  duel.currentQ = duel.questions[idx];
  duel.qTotalMs = duel.currentQ.estimatedSeconds * 1000;
  duel.qEndsAt = Date.now() + duel.qTotalMs;
  // bot scheduling
  if (duel.config.vsBot && duel.players[1].id === 'bot') {
    scheduleBot(duel);
  }
  return duel.currentQ;
}

function scheduleBot(duel) {
  const q = duel.currentQ;
  const lvl = Math.max(1, Math.min(5, duel.config.botLevel || 2));
  const acc = [0.35, 0.5, 0.65, 0.8, 0.92][lvl - 1];
  const willBeCorrect = Math.random() < acc * (q.difficulty === 3 ? 0.85 : 1);
  const thinkMs = (1200 + Math.random() * (duel.qTotalMs * 0.55)) * (q.difficulty === 1 ? 0.7 : 1);
  clearTimeout(duel.botTimer);
  duel.botTimer = setTimeout(() => {
    if (duel.state !== 'question') return;
    let choice = q.correctIndex;
    if (!willBeCorrect) {
      const wrongs = [0, 1, 2, 3].filter(i => i !== q.correctIndex);
      choice = wrongs[Math.floor(Math.random() * wrongs.length)];
    }
    duel.answered[1] = { optionIndex: choice, remainingMs: Math.max(500, duel.qEndsAt - Date.now()), at: Date.now() };
    maybeAdvance(duel);   // may lock answers + set lastResult ...
    busEmit('duel:opponent_answered', { qIndex: duel.qIndex });  // ... then notify UI
  }, Math.min(thinkMs, duel.qTotalMs - 400));
}

export function duelAnswer(duel, playerIdx, optionIndex) {
  if (duel.state !== 'question' || duel.answered[playerIdx]) return false;
  const remainingMs = Math.max(0, Math.min(duel.qTotalMs, duel.qEndsAt - Date.now()));
  duel.answered[playerIdx] = { optionIndex, remainingMs, at: Date.now() };
  maybeAdvance(duel);
  return true;
}

function maybeAdvance(duel) {
  if (duel.state === 'question' && duel.answered[0] && duel.answered[1]) {
    duelLockAnswers(duel);
  }
}

export function duelTimeout(duel) {
  if (duel.state !== 'question') return;
  duelLockAnswers(duel);
}

function duelLockAnswers(duel) {
  clearTimeout(duel.botTimer);
  duel.state = 'locked';
  const q = duel.currentQ;
  const result = { qIndex: duel.qIndex, correctIndex: q.correctIndex, players: [] };
  for (let i = 0; i < 2; i++) {
    const a = duel.answered[i];
    const correct = !!a && a.optionIndex === q.correctIndex;
    if (correct) {
      duel.streaks[i] += 1;
      duel.corrects[i] += 1;
      const gained = scoreAnswer({ difficulty: q.difficulty, remainingMs: a.remainingMs, totalMs: duel.qTotalMs, streak: duel.streaks[i] });
      duel.scores[i] += gained;
      var gainedOut = gained;
    } else {
      duel.streaks[i] = 0;
      duel.wrongs[i] += 1;
      var gainedOut = 0;
    }
    const sk = duel.perSkill[i][q.skill] || (duel.perSkill[i][q.skill] = { correct: 0, total: 0, chapterId: q.chapterId });
    sk.total += 1; if (correct) sk.correct += 1;
    result.players.push({
      idx: i, correct, chose: a ? a.optionIndex : null, gained: correct ? gainedOut : 0,
      score: duel.scores[i], streak: duel.streaks[i],
      responseMs: a ? duel.qTotalMs - a.remainingMs : null,
    });
  }
  // record mistakes for the human player
  recordAnswer(duel.currentQ, result.players[0].correct, result.players[0].chose, result.players[0].responseMs);
  duel.lastResult = result;
  return result;
}

export function duelNext(duel) {
  const next = duel.qIndex + 1;
  if (next >= 3) {
    duel.state = 'stage_end';
    return { stageEnd: true, stage: duel.stage };
  }
  duelDuelQuestion(duel, next);
  return { next: true, qIndex: next };
}

export function duelUseAssist(duel, playerIdx, type) {
  const p = duel.assists[playerIdx];
  if (!p[type] || p[type] <= 0) return { ok: false };
  if (duel.state !== 'question') return { ok: false };
  p[type] -= 1;
  if (type === 'removeTwo') {
    const wrongs = shuffle([0, 1, 2, 3].filter(i => i !== duel.currentQ.correctIndex)).slice(0, 2);
    duel.removedOptions[playerIdx] = wrongs;
    return { ok: true, remove: wrongs };
  }
  if (type === 'thinkingTime') {
    duel.qEndsAt += 15000;
    duel.qTotalMs += 15000;
    if (duel.botTimer) { /* bot keeps its schedule */ }
    return { ok: true, extended: 15000 };
  }
  return { ok: true, hint: duel.currentQ.conceptHint };
}

export function duelFinish(duel) {
  duel.state = 'completed';
  duel.finishedAt = Date.now();
  const [s0, s1] = duel.scores;
  let winner = 0.5;
  if (s0 !== s1) winner = s0 > s1 ? 0 : 1;
  else if (duel.wrongs[0] !== duel.wrongs[1]) winner = duel.wrongs[0] < duel.wrongs[1] ? 0 : 1;
  const me = duel.players[0].id;
  const isBot = duel.config.vsBot;
  // progress: xp, local rating (bot/casual only), records
  const xpGain = Math.round(12 + duel.corrects[0] * 5 + duel.scores[0] / 120);
  const xpRes = addXp(xpGain);
  if (isBot) {
    const s = S();
    if (winner === 0) s.progress.wins++;
    else if (winner === 1) s.progress.losses++;
    // simple elo vs bot at strength ~ 800 + botLevel*100
    const botRating = 750 + (duel.config.botLevel || 2) * 100;
    const ea = 1 / (1 + Math.pow(10, (botRating - s.progress.soloRating) / 400));
    const k = 24;
    s.progress.soloRating = Math.max(100, Math.round(s.progress.soloRating + k * (1 - winner - ea)));
    s.progress.sessionsDone++;
  }
  duel.result = { winner, scores: duel.scores, corrects: duel.corrects, wrongs: duel.wrongs, xpGain, xpRes };
  save();
  return duel.result;
}

// ---------------- solo modes ----------------
export function createSoloRun({ mode, chapterFilter = 'mixed', durationSec, questionCount, lives, seed }) {
  const run = {
    mode, chapterFilter, seed: seed || uid(),
    startedAt: Date.now(), state: 'running',
    questions: [], qIndex: -1,
    score: 0, correct: 0, wrong: 0, streak: 0, bestStreak: 0,
    lives: lives ?? null, maxLives: lives ?? null,
    endsAt: durationSec ? Date.now() + durationSec * 1000 : null,
    questionCount: questionCount || null,
    difficultyCursor: 1, // survival ramp
    answers: [], // {qid, correct, responseMs}
    hintsLeft: mode === 'precision' ? 1 : 0,
  };
  return run;
}

export function soloNextQuestion(run) {
  let pool;
  if (run.mode === 'boss') { pool = chapterPool(run.chapterFilter); }
  else if (run.chapterFilter && run.chapterFilter !== 'mixed') pool = chapterPool(run.chapterFilter);
  else {
    pool = getBank().questions;
  }
  // mastered-skip: in practice-flavored runs, do not re-test skills the
  // learner has already mastered (level 5) while alternatives remain
  if (run.mode !== 'boss') {
    const mastered = new Set(
      Object.entries(S().mastery)
        .filter(([k, m]) => k !== '__recent' && (m?.level || 0) >= 5)
        .map(([k]) => k));
    if (mastered.size) {
      const fresh = pool.filter(q => !mastered.has(q.skill));
      if (fresh.length >= 12) pool = fresh;
    }
  }
  // difficulty (reasoning-tier) targeting
  let target = run.difficultyCursor;
  if (run.mode === 'survival') {
    target = Math.min(4, 1 + Math.floor(run.answers.length / 5));
  } else if (run.mode === 'marathon') {
    target = Math.min(4, 1 + Math.floor(run.answers.length / 8));
  } else if (run.mode === 'precision') {
    target = Math.min(4, 2 + Math.floor(run.answers.length / 6));
  } else if (run.mode === 'blitz') {
    target = Math.min(4, 1 + Math.floor(run.answers.length / 6));
  }
  const recent = new Set(run.questions.slice(-14).map(q => q.id));
  let candidates = pool.filter(q => !recent.has(q.id));
  let tier = candidates.filter(q => q.difficulty === target);
  if (!tier.length) tier = candidates.filter(q => Math.abs(q.difficulty - target) <= 1);
  if (!tier.length) tier = candidates.length ? candidates : pool;
  // family rotation: avoid repeating the previous question's family
  const prev = run.questions[run.questions.length - 1];
  const prevFam = prev ? (prev.family || 'direct') : null;
  let famPool = tier;
  if (prevFam) {
    const alt = tier.filter(q => (q.family || 'direct') !== prevFam);
    if (alt.length) famPool = alt;
  }
  if (!famPool.length) famPool = getBank().questions;   // never fail to serve a question
  const q = famPool[Math.floor(Math.random() * famPool.length)];
  run.questions.push(q);
  run.qIndex = run.questions.length - 1;
  run.qTotalMs = q.estimatedSeconds * 1000 * (run.mode === 'blitz' ? 0.75 : run.mode === 'precision' ? 1.5 : 1);
  run.qEndsAt = Date.now() + run.qTotalMs;
  return q;
}
export function soloAnswer(run, optionIndex) {
  const q = run.questions[run.qIndex];
  const remainingMs = Math.max(0, run.qEndsAt - Date.now());
  const correct = optionIndex === q.correctIndex;
  let gained = 0;
  if (correct) {
    run.streak += 1;
    run.bestStreak = Math.max(run.bestStreak, run.streak);
    run.correct += 1;
    gained = scoreAnswer({ difficulty: q.difficulty, remainingMs, totalMs: run.qTotalMs, streak: run.streak });
    if (run.mode === 'blitz') gained = Math.round(gained * (1 + Math.min(run.streak, 8) * 0.06));
    run.score += gained;
  } else {
    run.streak = 0;
    run.wrong += 1;
    if (run.mode === 'survival' && run.lives !== null) run.lives -= 1;
  }
  run.answers.push({ qid: q.id, correct, responseMs: run.qTotalMs - remainingMs });
  recordAnswer(q, correct, optionIndex, run.qTotalMs - remainingMs);
  return { correct, gained, remainingLives: run.lives };
}

export function soloIsOver(run) {
  if (run.state !== 'running') return true;
  if (run.mode === 'blitz') return Date.now() >= run.endsAt;
  if (run.lives !== null && run.lives <= 0) return true;
  if (run.questionCount && run.answers.length >= run.questionCount) return true;
  return false;
}

export function soloFinish(run) {
  run.state = 'completed';
  run.finishedAt = Date.now();
  const s = S();
  const acc = run.answers.length ? run.correct / run.answers.length : 0;
  let xpGain = Math.round(8 + run.correct * 4 + acc * 15 + (run.mode === 'marathon' ? 15 : 0));
  const xpRes = addXp(xpGain);
  const rec = s.records[run.mode];
  const isRecord = !rec || run.score > rec.score;
  if (isRecord) s.records[run.mode] = { score: run.score, at: Date.now(), correct: run.correct, total: run.answers.length };
  if (run.streak) s.progress.bestStreak = Math.max(s.progress.bestStreak || 0, run.bestStreak);
  s.progress.sessionsDone++;
  save();
  return { xpGain, xpRes, isRecord, accuracy: acc };
}

// ---------------- boss battles ----------------
export const BOSSES = [
  { id: 'boss-ch1', chapterId: 'ch1', name: 'غول مجموعه‌ها', hp: 20, desc: 'نگهبان مجموعه‌ها و دنباله‌ها', color: '#FF8A3D', emoji: '⊄' },
  { id: 'boss-ch2', chapterId: 'ch2', name: 'اژدهای زاویه‌ها', hp: 20, desc: 'فرمانروای مثلثات', color: '#3D9BFF', emoji: '∠' },
  { id: 'boss-ch3', chapterId: 'ch3', name: 'جانشین رادیکال', hp: 22, desc: 'خداوند توان‌های گویا', color: '#8B5CF6', emoji: '√' },
  { id: 'boss-ch4', chapterId: 'ch4', name: 'غول معادله‌ها', hp: 22, desc: 'حاکم سهمی‌ها', color: '#FF5D73', emoji: 'x²' },
  { id: 'boss-ch5', chapterId: 'ch5', name: 'روایتگر توابع', hp: 20, desc: 'پاسدار دامنه و برد', color: '#7BC950', emoji: 'ƒ' },
  { id: 'boss-ch6', chapterId: 'ch6', name: 'شمارشگر الف', hp: 20, desc: 'استاد جایگشت‌ها', color: '#FFC53D', emoji: 'n!' },
  { id: 'boss-ch7', chapterId: 'ch7', name: 'شاه‌بخت احتمال', hp: 20, desc: 'کاهن شانس و آمار', color: '#4DD4C4', emoji: '%' },
];

export function createBossFight(bossId) {
  const boss = BOSSES.find(b => b.id === bossId);
  const fight = {
    boss, phase: 1, bossHp: boss.hp, playerHp: 3,
    run: createSoloRun({ mode: 'boss', chapterFilter: boss.chapterId, seed: uid() }),
    answeredInPhase: 0, log: [],
  };
  fight.run.difficultyCursor = 1;
  return fight;
}

export function bossAnswer(fight, optionIndex) {
  const res = soloAnswer(fight.run, optionIndex);
  fight.answeredInPhase++;
  if (res.correct) {
    fight.bossHp -= 1;
  } else {
    fight.playerHp -= 1;
  }
  // phase transitions every 7 questions
  if (fight.answeredInPhase >= 7 && fight.bossHp > 0) {
    fight.phase = Math.min(3, fight.phase + 1);
    fight.answeredInPhase = 0;
    fight.run.difficultyCursor = fight.phase;
  }
  fight.log.push({ correct: res.correct, phase: fight.phase });
  return res;
}

export function bossIsOver(fight) {
  return fight.bossHp <= 0 || fight.playerHp <= 0;
}

export function bossFinish(fight) {
  const won = fight.bossHp <= 0;
  const runRes = soloFinish(fight.run);
  if (won) {
    const s = S();
    if (!s.achievements.includes('boss-' + fight.boss.chapterId)) {
      s.achievements.push('boss-' + fight.boss.chapterId);
    }
    if (!s.cosmetics.skins.includes(fight.boss.id)) s.cosmetics.skins.push(fight.boss.id);
    save();
  }
  return { won, ...runRes };
}

// ---------------- learning engine ----------------
export function skillState(skillId) {
  const s = S();
  return s.mastery[skillId] || (s.mastery[skillId] = { ease: 2.5, interval: 0, streak: 0, due: 0, level: 0, lastDelta: 0 });
}

/** SM-2-flavored update on each answer. */
export function updateMastery(skillId, { correct, difficulty, responseMs }) {
  const m = skillState(skillId);
  const s = S();
  m.lastSeen = Date.now();
  if (correct) {
    m.streak += 1;
    m.ease = Math.min(3.2, m.ease + 0.12);
    m.interval = m.streak === 1 ? 1 : Math.round(m.interval * m.ease);
    m.due = Date.now() + m.interval * 86400000;
    // mastery level 0-5: needs successes across difficulties
    const target = Math.min(5, 1 + Math.floor(m.streak / 2) + (difficulty >= 2 ? 1 : 0) + (difficulty === 3 && m.streak > 3 ? 1 : 0));
    m.level = Math.max(m.level, Math.min(5, target));
    m.lastDelta = 1;
  } else {
    m.streak = 0;
    m.ease = Math.max(1.3, m.ease - 0.25);
    m.interval = 0;
    m.due = Date.now(); // relearn soon
    m.level = Math.max(0, m.level - 1);
    m.lastDelta = -1;
  }
  save();
  return m;
}

/** Weakest skills ordered for practice targeting. */
export function weakestSkills(n = 5) {
  const cur = getCurriculum();
  const scored = cur.skills.map(sk => {
    const m = S().mastery[sk.id] || { level: 0, streak: 0 };
    const st = S().stats.bySkill[sk.id] || { correct: 0, total: 0 };
    const acc = st.total ? st.correct / st.total : 0.5;
    const due = m.due && m.due < Date.now();
    return { skill: sk, level: m.level, acc, due, urgency: (5 - m.level) + (due ? 2 : 0) + (1 - acc) };
  });
  scored.sort((a, b) => b.urgency - a.urgency);
  return scored.slice(0, n);
}

/** Global adaptive difficulty target from recent performance. */
export function adaptiveDifficulty() {
  const s = S();
  const recent = s.mastery.__recent || (s.mastery.__recent = []);
  if (recent.length < 4) return 2;
  const acc = recent.slice(-10).reduce((a, b) => a + b, 0) / Math.min(10, recent.length);
  let d = acc > 0.85 ? 3 : acc > 0.65 ? 2 : 1;
  return d;
}
export function pushRecent(correct) {
  const s = S();
  s.mastery.__recent = (s.mastery.__recent || []).concat(correct ? 1 : 0).slice(-30);
  save();
}

/** record an answer into stats + mistakes + mastery. */
export function recordAnswer(q, correct, chosen, responseMs) {
  const s = S();
  s.stats.answered += 1;
  if (correct) s.stats.correct += 1;
  s.stats.timeMs += responseMs || 0;
  const sk = s.stats.bySkill[q.skill] || (s.stats.bySkill[q.skill] = { correct: 0, total: 0 });
  sk.total += 1; if (correct) sk.correct += 1;
  const ch = s.stats.byChapter[q.chapterId] || (s.stats.byChapter[q.chapterId] = { correct: 0, total: 0 });
  ch.total += 1; if (correct) ch.correct += 1;
  // v2 analytics: reasoning-tier and family breakdown (self-healing if an
  // old save lacks the blocks)
  s.stats.byDifficulty = s.stats.byDifficulty || {};
  s.stats.byFamily = s.stats.byFamily || {};
  s.stats.byMistakeType = s.stats.byMistakeType || {};
  const dK = String(q.tier || q.difficulty || 2);
  const dSt = s.stats.byDifficulty[dK] || (s.stats.byDifficulty[dK] = { correct: 0, total: 0 });
  dSt.total += 1; if (correct) dSt.correct += 1;
  const fam = q.family || 'direct';
  const fSt = s.stats.byFamily[fam] || (s.stats.byFamily[fam] = { correct: 0, total: 0 });
  fSt.total += 1; if (correct) fSt.correct += 1;
  if (!correct) {
    // classify the recurring-mistake type from the distractor feedback
    let mistakeType = 'concept';
    const fb = q.optionFeedback;
    if (Array.isArray(fb) && chosen != null && fb[chosen]) {
      const t = fb[chosen];
      mistakeType = /وارونه|جابه‌جا/.test(t) ? 'sign-or-order'
        : /فرمول|رابطه/.test(t) ? 'formula'
        : /جا انداخته|جا افتاد/.test(t) ? 'missing-step'
        : /جمع|ضرب|تقسیم|کم/.test(t) ? 'arithmetic'
        : /علامت/.test(t) ? 'sign-or-order'
        : 'concept';
    } else if (q.family === 'comparison') mistakeType = 'judgment';
    else if (q.family === 'error-id') mistakeType = 'error-spotting';
    const mt = s.stats.byMistakeType[mistakeType] || (s.stats.byMistakeType[mistakeType] = { count: 0 });
    mt.count += 1;
    s.mistakes.unshift({
      qid: q.id, skillId: q.skill, chapterId: q.chapterId, chosen,
      family: fam, tier: q.tier || q.difficulty || 2, mistakeType,
      ts: Date.now(), fixed: false, attempts: 0,
    });
    if (s.mistakes.length > 120) s.mistakes.length = 120;
  } else {
    // auto-fix matching mistake entries of this question
    for (const m of s.mistakes) if (m.qid === q.id) { m.fixed = true; }
  }
  updateMastery(q.skill, { correct, difficulty: q.difficulty, responseMs });
  pushRecent(correct);
  save();
}

// ---------------- GB15: Get Better in 15 ----------------
export function createGB15() {
  const weak = weakestSkills(6);
  const session = {
    id: uid(), startedAt: Date.now(), phase: 0, // 0 diag, 1 practice, 2 timed, 3 review, 4 retest, 5 report
    targetSkills: weak.map(w => w.skill.id),
    diag: { asked: 0, answers: [], questions: [] },
    practice: { asked: 0, answers: [], questions: [] },
    timed: { answers: [], score: 0 },
    retest: { asked: 0, answers: [], questions: [] },
    reviewedMistakes: 0,
    targetDifficulty: adaptiveDifficulty(),
  };
  return session;
}

export function gb15QuestionsFor(session, phase) {
  const skills = session.targetSkills;
  const pools = skills.map(skillPool);
  const flat = [].concat(...pools);
  if (phase === 'diag' || phase === 'retest') {
    // 5 questions, difficulty 2 fixed for comparability
    const d2 = flat.filter(q => q.difficulty === 2);
    return shuffle(d2).slice(0, 5);
  }
  if (phase === 'practice') {
    // adaptive: mix of target difficulty and one below
    const t = session.targetDifficulty;
    const primary = flat.filter(q => q.difficulty === t);
    const easier = flat.filter(q => q.difficulty === Math.max(1, t - 1));
    const qs = [];
    for (let i = 0; i < 7; i++) qs.push((i % 3 === 2 && easier.length ? easier : primary)[Math.floor(Math.random() * 100) % (i % 3 === 2 && easier.length ? easier.length : primary.length)] || primary[0]);
    return qs.slice(0, 7);
  }
  return [];
}

export function gb15AdvanceDifficulty(session, correct) {
  const rolling = session.practice.answers.concat(correct ? 1 : 0);
  const acc = rolling.slice(-4).reduce((a, b) => a + b, 0) / Math.min(4, rolling.length);
  if (acc >= 0.8 && session.targetDifficulty < 3) session.targetDifficulty += 1;
  else if (acc < 0.45 && session.targetDifficulty > 1) session.targetDifficulty -= 1;
}

export function gb15Report(session) {
  const diagAcc = session.diag.answers.length ? session.diag.answers.filter(Boolean).length / session.diag.answers.length : 0;
  const reAcc = session.retest.answers.length ? session.retest.answers.filter(Boolean).length / session.retest.answers.length : 0;
  const diagTime = session.diag.times ? session.diag.times.reduce((a, b) => a + b, 0) / Math.max(1, session.diag.times.length) : 0;
  const reTime = session.retest.times ? session.retest.times.reduce((a, b) => a + b, 0) / Math.max(1, session.retest.times.length) : 0;
  return {
    before: { accuracy: diagAcc, avgMs: diagTime },
    after: { accuracy: reAcc, avgMs: reTime },
    delta: { accuracy: reAcc - diagAcc, avgMs: reTime - diagTime },
    practicedSkills: session.targetSkills,
    nextSkill: weakestSkills(1)[0]?.skill || null,
  };
}

// ---------------- achievements ----------------
export const ACHIEVEMENTS = [
  { id: 'first-win', name: 'اولین پیروزی', desc: 'اولین بازی خود را ببر', icon: 'trophy' },
  { id: 'perfect-round', name: 'دورهٔ بی‌نقص', desc: 'یک مرحله را بدون غلط تمام کن', icon: 'star' },
  { id: 'streak-5', name: 'پنج‌تایی', desc: '۵ پاسخ درست پشت‌سرهم', icon: 'fire' },
  { id: 'streak-10', name: 'ده‌تایی طلایی', desc: '۱۰ پاسخ درست پشت‌سرهم', icon: 'bolt' },
  { id: 'comeback', name: 'بازگشت قهرمان', desc: 'بعد از عقب‌افتادن، برنده شو', icon: 'phoenix' },
  { id: 'algebra-apprentice', name: 'شاگرد جبر', desc: 'مهارت‌های فصل ۳ را تمرین کن', icon: 'sigma' },
  { id: 'geometry-specialist', name: 'متخصص هندسه', desc: 'مثلثات را مسلط شو', icon: 'angle' },
  { id: 'chapter-master-1', name: 'استاد فصل ۱', desc: 'فصل ۱ را کامل مسلط شو', icon: 'crown' },
  { id: 'chapter-master-2', name: 'استاد فصل ۲', desc: 'فصل ۲ را کامل مسلط شو', icon: 'crown' },
  { id: 'chapter-master-3', name: 'استاد فصل ۳', desc: 'فصل ۳ را کامل مسلط شو', icon: 'crown' },
  { id: 'chapter-master-4', name: 'استاد فصل ۴', desc: 'فصل ۴ را کامل مسلط شو', icon: 'crown' },
  { id: 'chapter-master-5', name: 'استاد فصل ۵', desc: 'فصل ۵ را کامل مسلط شو', icon: 'crown' },
  { id: 'chapter-master-6', name: 'استاد فصل ۶', desc: 'فصل ۶ را کامل مسلط شو', icon: 'crown' },
  { id: 'chapter-master-7', name: 'استاد فصل ۷', desc: 'فصل ۷ را کامل مسلط شو', icon: 'crown' },
  { id: 'boss-ch1', name: 'غول‌کش مجموعه‌ها', desc: 'غول فصل ۱ را شکست بده', icon: 'sword' },
  { id: 'boss-ch2', name: 'اژدهاکش', desc: 'اژدهای مثلثات را شکست بده', icon: 'sword' },
  { id: 'boss-ch3', name: 'ریشه‌کن', desc: 'جانشین رادیکال را شکست بده', icon: 'sword' },
  { id: 'boss-ch4', name: 'معادله‌شکن', desc: 'غول معادله‌ها را شکست بده', icon: 'sword' },
  { id: 'boss-ch5', name: 'تابع‌بان', desc: 'روایتگر توابع را شکست بده', icon: 'sword' },
  { id: 'boss-ch6', name: 'شمارش‌شکن', desc: 'شمارشگر الف را شکست بده', icon: 'sword' },
  { id: 'boss-ch7', name: 'بخت‌شکن', desc: 'شاه‌بخت احتمال را شکست بده', icon: 'sword' },
  { id: 'offline-explorer', name: 'کاوشگر آفلاین', desc: 'اولین بازی آفلاین را انجام بده', icon: 'compass' },
  { id: 'mistake-fixer', name: 'اصلاح‌گر', desc: '۲۰ اشتباه را در دفتر اشتباهات درست کن', icon: 'wrench' },
  { id: 'gb15-starter', name: '۱۵ دقیقه بهتر', desc: 'اولین جلسهٔ «بهتر شو در ۱۵» را کامل کن', icon: 'clock' },
  { id: 'gb15-master', name: 'رهرو تمرین', desc: '۱۰ جلسهٔ تمرین متمرکز کامل کن', icon: 'clock' },
  { id: 'weekly-champion', name: 'قهرمان هفته', desc: 'در یک جام قهرمان شو', icon: 'medal' },
];

export function unlockAchievement(id) {
  const s = S();
  if (s.achievements.includes(id)) return false;
  const meta = ACHIEVEMENTS.find(a => a.id === id);
  s.achievements.push(id);
  save();
  busEmit('achievement:unlocked', { id, meta });
  return true;
}

export function checkAchievements(context) {
  // context: {type: 'duel-end'|'solo-end'|'answer'|'gb15-end', ...}
  const s = S();
  if (context.type === 'answer') {
    if (context.streak >= 5) unlockAchievement('streak-5');
    if (context.streak >= 10) unlockAchievement('streak-10');
    if (context.skillChapter === 'ch3') unlockAchievement('algebra-apprentice');
    if (context.skillChapter === 'ch2') unlockAchievement('geometry-specialist');
  }
  if (context.type === 'duel-end') {
    if (context.won) unlockAchievement('first-win');
    if (context.wasBehind && context.won) unlockAchievement('comeback');
  }
  if (context.type === 'solo-end') unlockAchievement('offline-explorer');
  if (context.type === 'gb15-end') {
    unlockAchievement('gb15-starter');
    s.progress.gb15Count = (s.progress.gb15Count || 0) + 1;
    if (s.progress.gb15Count >= 10) unlockAchievement('gb15-master');
    save();
  }
  if (context.type === 'stage-end' && context.perfect) unlockAchievement('perfect-round');
  // chapter mastery achievements
  for (let ch = 1; ch <= 7; ch++) {
    const chapterSkills = getCurriculum().skills.filter(sk => sk.chapter === ch);
    if (chapterSkills.every(sk => (S().mastery[sk.id]?.level || 0) >= 4)) {
      unlockAchievement(`chapter-master-${ch}`);
    }
  }
  const fixedCount = S().mistakes.filter(m => m.fixed).length;
  if (fixedCount >= 20) unlockAchievement('mistake-fixer');
}
