// MATH ARENA v2 — dedicated test suite for the intelligent engine,
// textbook traceability data, and selection logic.
// Run: node scripts/test_v2_suite.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
let pass = 0, fail = 0;
const failures = [];
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; failures.push(name); console.log('FAIL  ' + name + (extra ? '  ' + JSON.stringify(extra).slice(0, 140) : '')); }
}

// ---------------------------------------------------------------- bank v2
const bank = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/question_bank.json'), 'utf8'));
const qs = bank.questions;
check('bank version is 2 with 700+ questions', bank.version === 2 && qs.length >= 700, qs.length);

const FAMILIES = ['conceptual', 'reverse', 'error-id', 'multi-step', 'application', 'comparison', 'challenge', 'direct'];
const famCount = {};
for (const q of qs) {
  famCount[q.family] = (famCount[q.family] || 0) + 1;
  if (!FAMILIES.includes(q.family)) { check('family valid ' + q.family, false); }
}
for (const f of FAMILIES) {
  check(`family present: ${f} (${famCount[f] || 0})`, famCount[f] > 0);
}
check('intelligent (non-direct) majority', (qs.length - famCount.direct) / qs.length >= 0.55,
  { direct: famCount.direct, total: qs.length });

// tier system: 1..4 by reasoning depth
const tierCount = {};
for (const q of qs) {
  tierCount[q.tier] = (tierCount[q.tier] || 0) + 1;
  if (![1, 2, 3, 4].includes(q.tier)) check('tier in 1..4', false, q.tier);
  if (q.tier !== q.difficulty) check('tier==difficulty field', false, q.id);
}
check('all four tiers populated', [1, 2, 3, 4].every(t => tierCount[t] > 0), tierCount);
check('expert tier exists and is rare-ish', tierCount[4] > 0 && tierCount[4] < qs.length * 0.12, tierCount[4]);

// structural variety: templates per skill, per-(skill,template) cap
const perSkillTemplate = new Map();
const tmplCounts = new Map();
for (const q of qs) {
  if (!perSkillTemplate.has(q.skill)) perSkillTemplate.set(q.skill, new Set());
  perSkillTemplate.get(q.skill).add(q.template);
  const k = q.skill + '|' + q.template;
  tmplCounts.set(k, (tmplCounts.get(k) || 0) + 1);
}
const multiTemplateSkills = [...perSkillTemplate.entries()].filter(([, s]) => s.size >= 3).length;
check('most skills have >=3 structural templates', multiTemplateSkills >= perSkillTemplate.size * 0.6,
  { multi: multiTemplateSkills, skills: perSkillTemplate.size });
const overCap = [...tmplCounts.entries()].filter(([, n]) => n > 8);
check('per-(skill,template) cap respected (<=8)', overCap.length === 0, overCap.slice(0, 3));

// fingerprints: near-duplicate rejection respected (<=3 per skill+fp)
const fpCounts = new Map();
for (const q of qs) {
  const k = q.skill + '|' + q.fingerprint;
  fpCounts.set(k, (fpCounts.get(k) || 0) + 1);
}
const dupOver = [...fpCounts.entries()].filter(([, n]) => n > 3);
check('structural near-duplicates capped (<=3 per skill)', dupOver.length === 0, dupOver.slice(0, 3));

// options integrity incl. comparison 3-option family
let optBad = 0, fbBad = 0;
for (const q of qs) {
  const want = q.family === 'comparison' ? 3 : 4;
  if (q.options.length !== want || new Set(q.options).size !== want) optBad++;
  if (q.correctIndex < 0 || q.correctIndex >= want) optBad++;
  if (!Array.isArray(q.optionFeedback) || q.optionFeedback.length !== q.options.length) fbBad++;
  else if (q.optionFeedback[q.correctIndex] !== '') fbBad++;   // correct pick has no mistake text
}
check('options counts/indices valid for every family', optBad === 0, optBad);
check('optionFeedback aligned to options; empty on the correct answer', fbBad === 0, fbBad);

// v2 questions carry per-distractor feedback
const v2 = qs.filter(q => q.id.startsWith('q2-'));
const withFb = v2.filter(q => q.optionFeedback.some(t => t && t.length > 8));
check('v2 questions carry per-distractor mathematical feedback', withFb.length >= v2.length * 0.8,
  { with: withFb.length, v2: v2.length });

// randomized ordering: correctIndex distribution across positions
const pos = [0, 0, 0, 0];
for (const q of qs) pos[q.correctIndex] += 1;
const total4 = qs.filter(q => q.family !== 'comparison').length;
check('correct answers spread across all option positions',
  pos.slice(0, 4).every(n => n > total4 * 0.12), pos);

// curriculum bounds
const curriculum = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/curriculum.json'), 'utf8'));
const skills = new Set(curriculum.skills.map(s => s.id));
const chapters = new Map(curriculum.chapters.map(c => [c.id, c]));
check('every question references a known skill', qs.every(q => skills.has(q.skill)));
check('every question references a known chapter', qs.every(q => chapters.has(q.chapterId)));
let pagesBad = 0;
for (const q of qs) {
  const ch = chapters.get(q.chapterId);
  if (!q.sourcePages || !q.sourcePages.length) { pagesBad++; continue; }
  const [a, b] = q.sourcePages;
  if (a < ch.sourcePages[0] || b > ch.sourcePages[1]) pagesBad++;
}
check('source pages within chapter bounds from the real book', pagesBad === 0, pagesBad);

// ---------------------------------------------------------------- textbook refs
const bookIdx = JSON.parse(fs.readFileSync(path.join(ROOT, 'app/assets/data/book_index.json'), 'utf8'));
const OFFSET = bookIdx.offsetPdfToBook;
check('pdf->book offset is the verified 5', OFFSET === 5);
let imgMissing = 0, lessonBad = 0;
for (const ch of bookIdx.chapters) {
  for (const ls of ch.lessons) {
    if (ls.pdfIndex !== ls.bookPage + OFFSET) lessonBad++;
  }
}
for (const q of qs) {
  const pdfIndex = q.bookPage + OFFSET;
  const f = path.join(ROOT, 'app/assets/book', `p-${String(pdfIndex).padStart(3, '0')}.jpg`);
  if (!fs.existsSync(f) || fs.statSync(f).size < 8000) imgMissing++;
}
check('every lesson maps printed page to pdf index consistently', lessonBad === 0, lessonBad);
check('every question\'s book page resolves to a rendered PDF page image', imgMissing === 0, imgMissing);
check('all 176 book page images present',
  fs.readdirSync(path.join(ROOT, 'app/assets/book')).filter(f => f.endsWith('.jpg')).length === 176);

// spot-verify known anchors from the book's own TOC:
const anchors = [
  ['ch4', 84, 'سهمی area'],           // ch4 lesson 2 parabola ~p78-82, تعیین علامت p83
  ['ch1', 2, 'lesson 1-1'],           // lesson 1 starts at printed p2
  ['ch7', 142, 'احتمال lesson 1'],
];
check('printed-page anchors match the book TOC (lesson 1-1 at p2)',
  bookIdx.chapters[0].lessons[0].bookPage === 2);
check('ch7 lesson 1 at printed p142 (TOC)',
  bookIdx.chapters[6].lessons[0].bookPage === 142);

// ---------------------------------------------------------------- selection logic (browser-free)
// minimal browser shims so data.js/core.js can load under node
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.document = { createElement: () => ({ style: {}, setAttribute() {}, addEventListener() {}, append() {} }) };

const data = await import(path.join(ROOT, 'app/assets/js/data.js'));
const core = await import(path.join(ROOT, 'app/assets/js/core.js'));

// stub the bank global then load
globalThis.window.__MA_CURRICULUM__ = curriculum;
globalThis.window.__MA_BANK__ = bank;
await data.loadData();

// family-aware pool pick
const pool = data.skillPool('seq-arithmetic');
const picked = data.pickFromPool(pool, 3, 'seed-x');
check('pickFromPool returns 3 distinct questions', picked.length === 3 && new Set(picked.map(q => q.id)).size === 3);
const fams = new Set(picked.map(q => q.family));
check('pickFromPool prefers distinct families when available', fams.size >= 2, [...fams]);

// deterministic seeding
const p2 = data.pickFromPool(pool, 3, 'seed-x');
check('pickFromPool is deterministic per seed', JSON.stringify(picked.map(q => q.id)) === JSON.stringify(p2.map(q => q.id)));

// publicQuestion carries v2 fields
const pub = data.publicQuestion(qs.find(q => q.id.startsWith('q2-')));
check('publicQuestion exposes family/tier/bookPage/optionFeedback',
  pub.family && pub.tier && pub.bookPage && Array.isArray(pub.optionFeedback));

// scoring: tier-4 reward
const s4 = core.fa ? null : null;
const game = await import(path.join(ROOT, 'app/assets/js/game.js'));
const scoreT4 = game.scoreAnswer({ difficulty: 4, remainingMs: 0, totalMs: 60000, streak: 0 });
const scoreT1 = game.scoreAnswer({ difficulty: 1, remainingMs: 0, totalMs: 60000, streak: 0 });
check('tier-4 (expert) scores above tier-1 base', scoreT4 - scoreT1 >= 145, { scoreT4, scoreT1 });
const scoreT3 = game.scoreAnswer({ difficulty: 3, remainingMs: 0, totalMs: 60000, streak: 0 });
check('tier reward is monotonic 1<2<3<4',
  scoreT1 < game.scoreAnswer({ difficulty: 2, remainingMs: 0, totalMs: 60000, streak: 0 }) &&
  game.scoreAnswer({ difficulty: 2, remainingMs: 0, totalMs: 60000, streak: 0 }) < scoreT3 && scoreT3 < scoreT4);

console.log(`\n==== v2 suite: ${pass}/${pass + fail} passed ====`);
if (failures.length) { console.log('FAILED:', failures); process.exit(1); }
