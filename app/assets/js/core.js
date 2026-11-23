// MATH ARENA - core: DOM helpers, router, persistence, formatting
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith('--')) node.style.setProperty(sk, String(sv));
        else node.style[sk] = sv;
      }
    }
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(9)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

// ---------------- router ----------------
const routes = new Map();
let currentScreen = null;
let currentCleanup = null;

export function route(name, factory) { routes.set(name, factory); }

export function nav(name, params = {}) {
  const factory = routes.get(name);
  if (!factory) { console.error('no route', name); return; }
  if (currentCleanup) { try { currentCleanup(); } catch (e) { /* ignore */ } currentCleanup = null; }
  const root = $('#screen');
  root.innerHTML = '';
  const { node, cleanup } = factory(params) || {};
  currentScreen = name;
  window.__maScreen = name;
  currentCleanup = cleanup || null;
  if (node) root.append(node);
  window.scrollTo(0, 0);
  root.firstElementChild && root.firstElementChild.scrollTop && (root.firstElementChild.scrollTop = 0);
}

export function screen() { return currentScreen; }

// ---------------- persistence ----------------
const KEY = 'matharena.v1';
const DEFAULT_STATE = {
  profile: null,            // {name, avatar:{base,color}, createdAt, token, serverUserId}
  progress: {
    xp: 0, level: 1,
    soloRating: 1000,           // local (bot/casual) rating
    wins: 0, losses: 0,
    sessionsDone: 0,
    bestStreak: 0,
  },
  mastery: {},              // skillId -> {ease, interval, streak, due, level 0-5, lastDelta}
  mistakes: [],             // {qid, skillId, chapterId, chosen, ts, fixed, attempts}
  records: {},              // mode -> {score, at, extra}
  achievements: [],
  cosmetics: { frames: ['default'], titles: ['rookie'], skins: ['fox'], equippedFrame: 'default', equippedTitle: 'rookie' },
  settings: {
    sound: 0.8, music: 0.5, haptics: true, reducedMotion: false,
    whiteboard: true, textbookBadge: true,
    serverUrl: (window.MA_DEFAULT_SERVER || 'http://192.168.1.10:8080'),
  },
  daily: { date: '', done: false, score: 0 },
  stats: { answered: 0, correct: 0, timeMs: 0, bySkill: {}, byChapter: {},
           byDifficulty: {}, byFamily: {}, byMistakeType: {} },
  pendingSessions: [],      // offline session summaries awaiting sync
  notifications: [],        // {id, kind, text, ts, read}
  onboarded: false,
};

let state = null;
let flushTimer = null;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? JSON.parse(raw) : structuredClone(DEFAULT_STATE);
    // shallow-merge defaults for forward compat
    for (const k of Object.keys(DEFAULT_STATE)) {
      if (state[k] === undefined) state[k] = structuredClone(DEFAULT_STATE[k]);
    }
    for (const k of Object.keys(DEFAULT_STATE.settings)) {
      if (state.settings[k] === undefined) state.settings[k] = DEFAULT_STATE.settings[k];
    }
    // v2 migration: deep-merge nested stats blocks so saves made by older
    // versions gain byDifficulty / byFamily / byMistakeType without data loss
    for (const k of Object.keys(DEFAULT_STATE.stats)) {
      if (state.stats[k] === undefined) state.stats[k] = structuredClone(DEFAULT_STATE.stats[k]);
    }
    if (!state.mastery) state.mastery = {};
    if (!Array.isArray(state.mistakes)) state.mistakes = [];
  } catch (e) {
    console.error('state load failed', e);
    state = structuredClone(DEFAULT_STATE);
  }
  return state;
}

export function S() {
  if (!state) load();
  return state;
}

export function save() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { console.error('save failed', e); }
  }, 250);
}
export function saveNow() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* full */ }
}

export function resetAll() {
  state = structuredClone(DEFAULT_STATE);
  saveNow();
}

// ---------------- XP / levels ----------------
export function xpForLevel(level) { return 50 * level * (level + 1); }
export function levelFromXp(xp) {
  let lvl = 1;
  while (xp >= 50 * lvl * (lvl + 1)) lvl++;
  return lvl;
}
export function addXp(amount) {
  const s = S();
  const before = s.progress.level;
  s.progress.xp = Math.max(0, s.progress.xp + Math.round(amount));
  s.progress.level = levelFromXp(s.progress.xp);
  save();
  return { before, after: s.progress.level, leveledUp: s.progress.level > before };
}

// ---------------- formatting ----------------
const FA = n => String(n).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
export const fa = FA;
export function fmtTime(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return FA(s);
}
export function fmtClock(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return FA(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
}
export function fmtDate(ts) {
  try { return FA(new Date(ts).toLocaleDateString('fa-IR')); } catch { return FA(ts); }
}
export function ratingName(r) {
  if (r < 900) return 'تازه‌کار';
  if (r < 1050) return 'آماتور';
  if (r < 1200) return 'حرفه‌ای';
  if (r < 1400) return 'استاد';
  return 'افسانه';
}
export function chapterName(id) { return ({ ch1: 'مجموعه و دنباله', ch2: 'مثلثات', ch3: 'توان و جبر', ch4: 'معادله‌ها', ch5: 'تابع', ch6: 'شمارش', ch7: 'آمار و احتمال' })[id] || id; }
export function chapterColor(id) { return ({ ch1: '#38BDF8', ch2: '#818CF8', ch3: '#2DD4BF', ch4: '#FB7185', ch5: '#4ADE80', ch6: '#F2B84B', ch7: '#C084FC' })[id] || '#38BDF8'; }
export const TIER_LABEL = { 1: 'آسان', 2: 'متوسط', 3: 'سخت', 4: 'خبره' };
export const FAMILY_LABEL = {
  conceptual: 'مفهومی', reverse: 'وارونه', 'error-id': 'خطایاب',
  'multi-step': 'چندمرحله‌ای', application: 'کاربردی', comparison: 'قضاوت',
  challenge: 'چالشی', direct: 'مستقیم',
};

// ---------------- events ----------------
const listeners = new Map();
export function on(ev, fn) {
  if (!listeners.has(ev)) listeners.set(ev, new Set());
  listeners.get(ev).add(fn);
  return () => listeners.get(ev)?.delete(fn);
}
export function emit(ev, payload) {
  listeners.get(ev)?.forEach(fn => { try { fn(payload); } catch (e) { console.error(e); } });
  listeners.get('*')?.forEach(fn => { try { fn({ ev, payload }); } catch (e) { /* */ } });
}

// ---------------- misc ----------------
export function uid() { return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
export function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function vibrate(pattern) {
  const s = S();
  if (!s.settings.haptics) return;
  try { navigator.vibrate && navigator.vibrate(pattern); } catch (e) { /* */ }
}
