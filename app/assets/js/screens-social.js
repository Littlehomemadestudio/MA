// MATH ARENA - social screens: friends, add friend, friend profile,
// invitations, tournaments, tournament detail + bracket, player profile,
// leaderboard.
import { el, S, save, fa, nav, on } from './core.js';
import { sfx } from './audio.js';
import { icon, avatarView, mascot, modal, toast, emptyState, screenScaffold, confetti, secHead, modeArt } from './ui.js';
import { Api, emitSock, isOnline, sock } from './net.js';

// ================================================================ FRIENDS

export function friendsScreen() {
  const body = el('div', {});
  const state = { friends: [], incoming: [], outgoing: [], loaded: false };

  async function refresh() {
    if (!isOnline()) {
      renderOffline();
      return;
    }
    try {
      const d = await Api.friends();
      Object.assign(state, d, { loaded: true });
      render();
    } catch (e) {
      renderOffline(e.message);
    }
  }

  function renderOffline(err) {
    body.innerHTML = '';
    body.append(
      emptyState('sad', 'برای دوست‌یابی به سرور وصل شو', err ? 'خطا: ' + err : 'لیست دوستان آنلاین در دسترس نیست'),
      el('button', { class: 'btn blue block', text: 'رفتن به تنظیمات اتصال', onclick: () => nav('settings') }));
  }

  function render() {
    body.innerHTML = '';
    const { friends, incoming, outgoing } = state;
    const code = S().profile?.friendCode;
    if (code) {
      body.append(el('div', { class: 'panel row', style: { background: 'linear-gradient(120deg,#F3EDFF,#EAE0FF)' } },
        el('div', { class: 'list-ico', style: { background: '#8B5CF6' }, html: icon('friends', 18, '#fff') }),
        el('div', { class: 'grow' },
          el('b', { class: 'tiny', text: 'کد دوستی تو' }),
          el('div', { class: 'pill purple', style: { marginTop: '3px', letterSpacing: '1px' }, text: code })),
        el('button', {
          class: 'btn small', text: 'کپی',
          onclick: () => { navigator.clipboard?.writeText(code).then(() => toast('کپی شد!')); },
        })));
    }
    if (incoming.length) {
      body.append(secHead('درخواست‌های دریافتی', { accent: 'var(--orange)', count: fa(incoming.length) }));
      for (const r of incoming) {
        body.append(el('div', { class: 'panel paper row' },
          avatarView(r.user.avatar, 40),
          el('div', { class: 'grow' }, el('b', { class: 'tiny', text: r.user.name })),
          el('button', {
            class: 'btn small lime', text: 'قبول',
            onclick: async () => { const res = await Api.acceptFriend(r.id); if (!res.ok) toast('خطا'); refresh(); sfx.friendJoin(); },
          }),
          el('button', { class: 'btn small ghost', text: 'رد', onclick: async () => { await Api.declineFriend(r.id); refresh(); } })));
      }
    }
    if (outgoing.length) {
      body.append(secHead('درخواست‌های ارسالی', { accent: 'var(--ink-soft)', count: fa(outgoing.length) }));
      for (const r of outgoing) {
        body.append(el('div', { class: 'panel row', style: { opacity: '.7' } },
          avatarView(r.user?.avatar, 36),
          el('div', { class: 'grow tiny' }, el('b', { text: r.user?.name || '?' })),
          el('span', { class: 'pill', text: 'ارسال شد' })));
      }
    }
    body.append(secHead('دوستان', { accent: 'var(--purple)', count: fa(friends.length) }));
    if (!friends.length) {
      body.append(emptyState('balloon', 'هنوز دوستی نداری', 'با کد دوستی یا جست‌وجوی نام، دوست اضافه کن'));
    }
    for (const f of friends) {
      body.append(el('div', { class: 'panel paper row' },
        avatarView(f.avatar, 44),
        el('div', { class: 'grow', onclick: () => nav('friend-profile', { userId: f.id }) },
          el('b', { class: 'tiny', text: f.name }),
          el('div', { class: 'tiny muted', text: `سطح ${fa(f.level)} · رده ${fa(f.rating)}` })),
        el('span', { class: 'pill ' + (f.online ? 'lime' : ''), text: f.inMatch ? 'در بازی' : f.online ? 'آنلاین' : 'آفلاین', style: { fontSize: '10px' } }),
        el('button', {
          class: 'btn small purple', html: icon('swords', 15) + ' چالش',
          onclick: async () => {
            const ack = await emitSock('friend:challenge', { userId: f.id });
            if (ack.ok) { toast('دعوت فرستاده شد — اتاق ساخته شد'); nav('waiting-room', { code: ack.code, host: true }); }
            else toast(ack.error === 'friend-offline' ? 'دوستت آنلاین نیست' : 'خطا در ارسال دعوت');
          },
        })));
    }
    body.append(el('button', { class: 'btn primary block', html: icon('plus', 18) + ' افزودن دوست', onclick: () => nav('add-friend') }));
    // recent opponents from local history
    const recent = S().profile?.recentOpponents || [];
    if (recent.length) {
      body.append(secHead('حریف‌های اخیر', { accent: 'var(--blue)' }));
      for (const r of recent.slice(0, 5)) {
        body.append(el('div', { class: 'panel row', style: { padding: '8px 12px' } },
          avatarView(r.avatar, 34),
          el('div', { class: 'grow tiny' }, el('b', { text: r.name }))),
        );
      }
    }
  }

  const unsubs = [
    on('srv:friend:request', () => { sfx.notify(); toast('درخواست دوستی جدید!', { icon: 'friends' }); refresh(); }),
    on('srv:friend:accepted', () => { sfx.friendJoin(); refresh(); }),
    on('srv:friend:invite', (p) => {
      sfx.notify();
      document.getElementById('app').append(modal({
        title: 'دعوت به بازی',
        body: el('div', { class: 'row' }, avatarView(p.from.avatar, 54), el('div', { class: 'grow' }, el('b', { text: p.from.name + ' تو را به دوئل دعوت کرد!' }))),
        actions: [
          { label: 'قبول دعوت', cls: 'primary', fn: async () => { const a = await emitSock('room:join', { code: p.code }); if (a.ok) nav('waiting-room', { code: p.code, room: a.room }); } },
          { label: 'بعداً', cls: 'ghost' },
        ],
      }));
    }),
  ];

  refresh();
  return { node: screenScaffold({ active: 'friends', title: 'دوستان', body, connBanner: true }), cleanup() { unsubs.forEach(u => u()); } };
}

// ================================================================ ADD FRIEND

export function addFriendScreen() {
  const input = el('input', { type: 'text', placeholder: 'کد دوستی مثل MA123456 یا نام', maxlength: '20', style: { textAlign: 'center' } });
  const results = el('div', { class: 'col', id: 'search-results' });
  let debounce = null;
  input.oninput = () => {
    clearTimeout(debounce);
    debounce = setTimeout(search, 350);
  };
  async function search() {
    const q = input.value.trim();
    results.innerHTML = '';
    if (q.length < 2) return;
    if (/^MA\d{4,8}$/i.test(q)) {
      results.append(el('div', { class: 'panel paper row' },
        el('div', { class: 'list-ico', style: { background: '#8B5CF6' }, html: icon('friends', 18, '#fff') }),
        el('div', { class: 'grow tiny' }, el('b', { text: 'ارسال درخواست با کد ' + q })),
        el('button', {
          class: 'btn small primary', text: 'ارسال',
          onclick: async () => {
            const r = await Api.friendRequest(q);
            if (r.ok) { sfx.friendJoin(); toast('درخواست فرستاده شد'); results.innerHTML = ''; input.value = ''; }
            else toast(r.error === 'already-friends' ? 'قبلاً دوست شده‌اید' : r.error === 'already-requested' ? 'قبلاً درخواست فرستاده‌ای' : 'کاربر پیدا نشد');
          },
        })));
      return;
    }
    try {
      const d = await Api.search(q);
      for (const u of d.results) {
        results.append(el('div', { class: 'panel paper row' },
          avatarView(u.avatar, 38),
          el('div', { class: 'grow' }, el('b', { class: 'tiny', text: u.name }), el('div', { class: 'tiny muted', text: 'کد: ' + u.friendCode })),
          el('button', {
            class: 'btn small primary', text: 'دعوت',
            onclick: async () => {
              const r = await Api.friendRequest(u.friendCode);
              if (r.ok) { toast('درخواست فرستاده شد'); results.innerHTML = ''; }
              else toast('خطا: ' + r.error);
            },
          })));
      }
      if (!d.results.length) results.append(emptyState('search', 'کسی پیدا نشد', 'کد دقیق یا نام را امتحان کن'));
    } catch (e) { results.append(emptyState('sad', 'جست‌وجو ناموفق', e.message)); }
  }
  const body = el('div', {},
    el('div', { class: 'row', style: { gap: '12px', margin: '4px 0 14px' } },
      el('div', { style: { width: '64px', height: '64px', flexShrink: '0' } }, mascot('happy', 'idle', 64)),
      el('div', {},
        el('p', { class: 'h-sub', style: { margin: '0 0 4px' }, text: 'کد دوستی دوستت را وارد کن یا نامش را جست‌وجو کن' }),
        el('p', { class: 'tiny muted', style: { margin: 0, lineHeight: '1.9' }, text: 'کد دوستی از پروفایل دوستت قابل کپی است — بدون نیاز به شماره یا ایمیل' }))),
    input, el('div', { style: { height: '10px' } }), results);
  return { node: screenScaffold({ active: 'friends', title: 'افزودن دوست', body, noNav: true, back: 'friends' }) };
}

// ================================================================ FRIEND PROFILE / PLAYER PROFILE

export function friendProfileScreen(params) {
  const body = el('div', { class: 'center muted tiny' }, 'در حال بارگذاری...');
  (async () => {
    try {
      const d = await Api.user(params.userId);
      const u = d.user;
      body.innerHTML = '';
      body.append(
        el('div', { class: 'card center', style: { background: 'linear-gradient(170deg,#163956,#0B1D33)', color: '#fff', paddingTop: '22px' } },
          avatarView(u.avatar, 92),
          el('h3', { class: 'h-title', style: { color: '#fff', margin: '8px 0 2px' }, text: u.name }),
          el('div', { class: 'chip-row', style: { justifyContent: 'center', marginTop: '6px' } },
            el('span', { class: 'pill blue', text: 'رده ' + fa(u.rating) }),
            el('span', { class: 'pill', text: 'سطح ' + fa(u.level) }),
            el('span', { class: 'pill lime', text: fa(u.wins) + ' برد' }),
            el('span', { class: 'pill coral', text: fa(u.losses) + ' باخت' }))),
        secHead('ردهٔ فصل‌ها', { accent: 'var(--blue)' }),
        el('div', { class: 'panel paper' },
          el('div', { class: 'col', style: { marginTop: '8px', gap: '6px' } },
            Object.entries(u.chapterRatings || {}).map(([ch, r]) => el('div', { class: 'row' },
              el('span', { class: 'tiny grow', text: 'فصل ' + fa(Number(ch.replace('ch', ''))) }),
              el('div', { class: 'bar blue grow', style: { maxWidth: '140px' } }, el('i', { style: { width: Math.min(100, (r - 600) / 8) + '%' } })),
              el('span', { class: 'tiny', text: fa(r) }))))),
        secHead('بازی‌های اخیر', { accent: 'var(--purple)' }),
        el('div', { class: 'panel paper' },
          d.history.length
            ? el('div', { class: 'col', style: { marginTop: '8px', gap: '6px' } },
              d.history.map(h => el('div', { class: 'row' },
                el('span', { class: 'pill ' + (h.me?.userId === h.winner ? 'lime' : h.winner === null ? '' : 'coral'), style: { fontSize: '10px' }, text: h.me?.userId === h.winner ? 'برد' : h.winner === null ? 'مساوی' : 'باخت' }),
                el('span', { class: 'tiny grow', text: h.label || 'دوئل' }),
                el('span', { class: 'tiny muted', text: fa(h.me?.score || 0) + ' امتیاز' }))))
            : el('p', { class: 'tiny muted', text: 'بازی‌ای ثبت نشده' })),
        el('button', {
          class: 'btn purple block', text: 'چالش دوئل',
          onclick: async () => {
            const ack = await emitSock('friend:challenge', { userId: u.id });
            if (ack.ok) nav('waiting-room', { code: ack.code, host: true });
            else toast(ack.error === 'friend-offline' ? 'آنلاین نیست' : 'خطا');
          },
        }),
        el('button', {
          class: 'btn ghost block small', text: 'حذف از دوستان',
          onclick: async () => {
            await Api.removeFriend(u.id);
            toast('حذف شد');
            nav('friends');
          },
        }));
    } catch (e) {
      body.innerHTML = '';
      body.append(emptyState('sad', 'پروفایل پیدا نشد', e.message));
    }
  })();
  return { node: screenScaffold({ active: 'friends', title: 'پروفایل بازیکن', body, noNav: true, back: 'friends' }) };
}

// ================================================================ TOURNAMENTS

export function tournamentsScreen() {
  const body = el('div', {});
  let list = [];

  async function refresh() {
    try {
      const d = await Api.tournaments();
      list = d.tournaments;
      render();
    } catch (e) {
      body.innerHTML = '';
      body.append(emptyState('sad', 'جام‌ها در دسترس نیستند', isOnline() ? e.message : 'برای شرکت در جام‌ها به سرور وصل شو'),
        el('button', { class: 'btn blue block', text: 'تنظیمات اتصال', onclick: () => nav('settings') }));
    }
  }

  function render() {
    body.innerHTML = '';
    body.append(el('button', {
      class: 'btn primary block', style: { marginBottom: '12px' }, text: 'ساخت جام دلخواه +',
      onclick: () => nav('tournament-create'),
    }));
    if (!list.length) body.append(emptyState('search', 'جامی فعال نیست', 'جام‌های روزانه و هفتگی خودکار ساخته می‌شوند'));
    for (const t of list) {
      const typeLabels = { daily: 'روزانه', weekly: 'هفتگی', chapter: 'فصلی', friends: 'دوستانه', season: 'فصلی بزرگ', custom: 'دلخواه' };
      body.append(el('div', {
        class: 'panel mode-tile', style: { background: '#102A46', cursor: 'pointer' },
        onclick: () => nav('tournament-detail', { id: t.id }),
      },
        el('div', { class: 'm-ico', style: { background: t.format === 'knockout' ? '#FF5D73' : '#FFC53D', boxShadow: '0 3px 0 rgba(30,42,74,.7)' }, html: icon(t.format === 'knockout' ? 'swords' : 'star', 24, '#fff') }),
        el('div', { class: 'grow' },
          el('b', { text: t.name }),
          el('div', { class: 'tiny muted', text: `${typeLabels[t.type] || t.type} · ${t.format === 'knockout' ? 'حذفی' : 'امتیازی'} · ${fa(t.participants.length)} شرکت‌کننده` }),
          el('div', { class: 'chip-row', style: { marginTop: '4px' } },
            el('span', { class: 'pill ' + (t.status === 'running' ? 'lime' : t.status === 'finished' ? '' : 'gold'), style: { fontSize: '10px' }, text: t.status === 'running' ? 'در جریان' : t.status === 'finished' ? 'پایان‌یافته' : 'ثبت‌نام باز' }))),
        icon('back', 18, '#B9C4E0')));
    }
  }
  refresh();
  const unsub = on('srv:tournament:update', () => refresh());
  return { node: screenScaffold({ active: 'tournaments', title: 'جام‌ها و رقابت‌ها', body, connBanner: true }), cleanup() { unsub(); } };
}

export function tournamentCreateScreen() {
  let cfg = { name: '', type: 'custom', chapter: 'mixed', format: 'score', questionsCount: 10 };
  const body = el('div', {});
  const render = () => {
    body.innerHTML = '';
    const nameInput = el('input', { type: 'text', maxlength: '40', placeholder: 'نام جام', value: cfg.name });
    nameInput.oninput = () => cfg.name = nameInput.value;
    body.append(
      el('div', { class: 'panel paper' }, el('b', { class: 'tiny', text: 'نام جام' }), nameInput),
      el('div', { class: 'panel paper' },
        el('b', { class: 'tiny', text: 'فرمت' }),
        el('div', { class: 'row', style: { marginTop: '8px' } },
          [{ id: 'score', t: 'امتیازی (سؤال ثابت)' }, { id: 'knockout', t: 'حذفی (دوئل مستقیم)' }].map(f =>
            el('button', { class: 'btn small grow ' + (cfg.format === f.id ? 'primary' : 'ghost'), text: f.t, onclick: () => { cfg.format = f.id; render(); } })))),
      cfg.format === 'score' && el('div', { class: 'panel paper' },
        el('b', { class: 'tiny', text: 'تعداد سؤال: ' + fa(cfg.questionsCount) }),
        el('div', { class: 'row', style: { marginTop: '8px' } },
          [5, 10, 15, 20].map(n => el('button', { class: 'btn small grow ' + (cfg.questionsCount === n ? 'primary' : 'ghost'), text: fa(n), onclick: () => { cfg.questionsCount = n; render(); } })))),
      el('div', { class: 'panel paper' },
        el('b', { class: 'tiny', text: 'فصل' }),
        el('div', { class: 'chip-row', style: { marginTop: '8px' } },
          [{ id: 'mixed', t: 'ترکیبی' }, ...[1, 2, 3, 4, 5, 6, 7].map(i => ({ id: 'ch' + i, t: 'فصل ' + fa(i) }))].map(c =>
            el('button', { class: 'filter-chip' + (cfg.chapter === c.id ? ' active' : ''), text: c.t, onclick: () => { cfg.chapter = c.id; render(); } })))),
      el('button', {
        class: 'btn primary big block', text: 'ساخت جام ←',
        onclick: async () => {
          const r = await Api.createTournament(cfg);
          if (r.tournament) { toast('جام ساخته شد!'); nav('tournament-detail', { id: r.tournament.id }); }
          else toast('خطا در ساخت جام');
        },
      }));
  };
  render();
  return { node: screenScaffold({ active: 'tournaments', title: 'ساخت جام', body, noNav: true, back: 'tournaments' }) };
}

export function tournamentDetailScreen(params) {
  const body = el('div', { class: 'center muted tiny' }, 'در حال بارگذاری...');
  let tour = null;

  async function refresh() {
    try {
      const d = await Api.tournament(params.id);
      tour = d.tournament;
      render(d.standings);
    } catch (e) {
      body.innerHTML = '';
      body.append(emptyState('sad', 'جام پیدا نشد', e.message));
    }
  }

  function render(standings) {
    body.innerHTML = '';
    const me = S().profile?.serverUserId;
    const joined = tour.participants.some(p => p.userId === me);
    body.append(
      el('div', { class: 'panel paper' },
        el('div', { class: 'row' },
          el('div', { class: 'm-ico', style: { background: tour.format === 'knockout' ? '#FF5D73' : '#FFC53D' }, html: icon(tour.format === 'knockout' ? 'swords' : 'star', 24, '#fff') }),
          el('div', { class: 'grow' },
            el('b', { text: tour.name }),
            el('div', { class: 'tiny muted', text: `${tour.format === 'knockout' ? 'حذفی' : 'امتیازی'} · ${tour.chapter !== 'mixed' ? 'فصل ' + fa(Number(tour.chapter.replace('ch', ''))) : 'ترکیبی'} · ${fa(tour.participants.length)} شرکت‌کننده` }))),
        el('div', { class: 'row', style: { marginTop: '10px' } },
          !joined && tour.status !== 'finished'
            ? el('button', {
              class: 'btn primary grow', text: 'ثبت‌نام در جام',
              onclick: async () => { const r = await Api.joinTournament(tour.id); if (r.ok) { sfx.correct(); refresh(); } else toast(r.error === 'registration-closed' ? 'ثبت‌نام بسته است' : 'خطا'); },
            })
            : el('span', { class: 'pill lime', text: joined ? 'ثبت‌نام شده ✓' : 'پایان‌یافته' }),
          joined && tour.format === 'score' && tour.status === 'running' && el('button', {
            class: 'btn blue grow', text: 'بازی کن!',
            onclick: () => nav('tournament-run', { id: tour.id }),
          }))));

    if (tour.format === 'knockout' && tour.rounds.length) {
      body.append(secHead('نمودار حذفی', { accent: 'var(--coral)' }),
        el('div', { class: 'panel paper' },
        el('div', { class: 'bracket' },
          tour.rounds.map((round, ri) => el('div', { class: 'br-round' },
            el('div', { class: 'tiny muted center', text: ri === tour.rounds.length - 1 ? 'فینال' : ri === 0 ? 'دور اول' : 'دور ' + fa(ri + 1) }),
            round.matches.map(m => el('div', { class: 'br-match' },
              el('div', { class: 'br-slot' + (m.a === m.winner ? ' winner' : '') },
                el('span', { text: tour.participants.find(p => p.userId === m.a)?.name || (m.a === null ? '—' : 'بازیکن ' + fa(m.a)) }),
                el('b', { text: fa(m.scoreA || 0) })),
              el('div', { class: 'br-slot' + (m.b === m.winner ? ' winner' : '') },
                el('span', { text: tour.participants.find(p => p.userId === m.b)?.name || (m.b === null ? '—' : 'بازیکن ' + fa(m.b)) }),
                el('b', { text: fa(m.scoreB || 0) }))))))),
        joined && tour.status === 'running' && el('button', {
          class: 'btn purple block', style: { marginTop: '10px' }, text: 'بازی مسیر بعدی من',
          onclick: async () => {
            const ack = await emitSock('tournament:play_match', { id: tour.id });
            if (ack.ok && ack.matchId) {
              toast('مسابقه ساخته شد!');
            } else if (ack.bye) { toast('حریف نداری — رفتی مرحلهٔ بعد!'); refresh(); }
            else toast(ack.error === 'opponent-offline' ? 'حریف این مرحله آنلاین نیست' : ack.error === 'no-pending-match' ? 'بازی فعالی برای تو نیست' : 'خطا');
          },
        })));
    }

    if (standings && standings.length) {
      body.append(secHead('جدول امتیازات', { accent: 'var(--gold)' }),
        el('div', { class: 'panel paper' },
        standings.slice(0, 15).map((p, i) => el('div', { class: 'rank-row' },
          el('div', { class: 'rank-medal rank-' + (i + 1 <= 3 ? i + 1 : 0), text: fa(i + 1) }),
          el('div', { class: 'grow' }, el('b', { class: 'tiny', text: p.name || 'بازیکن ' + fa(p.userId) })),
          el('b', { text: fa(p.score || 0) })))));
    }
    body.append(el('div', { class: 'tiny muted center', text: 'پاداش قهرمان: نشان قهرمان + XP ویژه' }));
  }

  refresh();
  const unsub = on('srv:tournament:update', () => refresh());
  return { node: screenScaffold({ active: 'tournaments', title: 'جزئیات جام', body, noNav: true, back: 'tournaments' }), cleanup() { unsub(); } };
}

/** Score-tournament run: fixed question set, timed, submit answers to server. */
export function tournamentRunScreen(params) {
  import('./data.js').then(async ({ publicQuestion }) => {
    try {
      const d = await Api.tournament(params.id);
      const qs = d.tournament.questionSet;
      nav('solo', { mode: 'precision', chapterFilter: d.tournament.chapter, tournament: { id: params.id, questions: qs } });
    } catch (e) { toast('خطا در دریافت جام'); nav('tournaments'); }
  });
  return { node: el('div', { class: 'screen' }, el('div', { class: 'scroll no-nav center muted' }, 'در حال آماده‌سازی مسابقه...')) };
}

// ================================================================ LEADERBOARD (in profile hub)

export function leaderboardScreen() {
  const body = el('div', {});
  let scope = 'overall';
  const chipRow = el('div', { class: 'filters' },
    [{ id: 'overall', t: 'کلی' }, ...[1, 2, 3, 4, 5, 6, 7].map(i => ({ id: 'ch' + i, t: 'فصل ' + fa(i) }))].map(c =>
      el('button', {
        class: 'filter-chip' + (scope === c.id ? ' active' : ''), text: c.t,
        onclick: () => { scope = c.id; load(); },
      })));
  const list = el('div', { class: 'col' });
  body.append(chipRow, list);
  async function load() {
    chipRow.querySelectorAll('.filter-chip').forEach((c, i) => c.classList.toggle('active', [...chipRow.children][i].dataset?.v === scope));
    list.innerHTML = '';
    list.append(el('div', { class: 'center muted tiny' }, 'در حال بارگذاری...'));
    try {
      const d = await Api.leaderboard(scope);
      list.innerHTML = '';
      if (!d.top.length) list.append(emptyState('search', 'هنوز رتبه‌ای ثبت نشده'));
      d.top.forEach((u, i) => {
        const me = u.id === S().profile?.serverUserId;
        const medalCls = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : '';
        list.append(el('div', { class: 'rank-row', style: me ? 'background:#FFF3D6;border-radius:12px' : '' },
          el('div', { class: 'rank-medal ' + medalCls, html: i === 0 ? icon('crown', 17, '#1E2A4A') : fa(i + 1) }),
          avatarView(u.avatar, 34),
          el('div', { class: 'grow' }, el('b', { class: 'tiny', text: u.name + (me ? ' (تو)' : '') }), el('div', { class: 'tiny muted', text: 'سطح ' + fa(u.level) })),
          el('div', { style: { textAlign: 'left' } }, el('b', { text: fa(u.rating) }), el('div', { class: 'tiny muted', text: fa(u.wins) + 'W/' + fa(u.losses) + 'L' }))));
      });
    } catch (e) {
      list.innerHTML = '';
      list.append(emptyState('sad', 'جدول در دسترس نیست', isOnline() ? e.message : 'آفلاین هستی'));
    }
  }
  load();
  return { node: screenScaffold({ active: 'profile', title: 'جدول رتبه‌بندی', body, noNav: true, back: 'profile' }) };
}
