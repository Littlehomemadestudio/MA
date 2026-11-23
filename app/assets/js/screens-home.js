// MATH ARENA - home & flow screens (v2 arcade):
// splash, onboarding, home game hub, arcade play hub, live lobby,
// matchmaking radar, waiting room, settings, notifications, daily.
import { el, S, save, saveNow, fa, nav, on, uid, emit, resetAll } from './core.js';
import { sfx, startMusic, stopMusic } from './audio.js';
import {
  icon, mascot, mascotSVG, avatarView, modal, toast, confetti, screenScaffold, emptyState, topbar,
  AVATAR_BASES, AVATAR_COLORS, avatarSVG, modeArt, lockSVG, sceneBand, secHead, xpRing, heartSVG,
} from './ui.js';
import {
  Api, ensureSocket, sock, emitSock, isOnline, registerOnline, syncPending,
  probeServer, serverUrl, queueSession, autoSync,
} from './net.js';
import { SOLO_MODES } from './screens-game.js';

// ================================================================ SPLASH

export function splashScreen() {
  const scr = el('div', { class: 'splash' },
    el('div', { class: 'logo-art', html: mascotSVG('excited', 180) }),
    el('h1', { text: 'میدان ریاضی' }),
    el('div', { class: 'tag', text: 'آرنتای رقابت ریاضی — پایه دهم' }),
    el('div', { class: 'loading-bar' }, el('i', {})),
    el('div', { class: 'tag tiny', id: 'splash-status', text: 'در حال بارگذاری دنیای ریاضی...' }));
  scr.append(el('div', { class: 'stage-line' }));

  let destroyed = false;
  (async () => {
    try {
      const { loadData } = await import('./data.js');
      const stats = await loadData();
      document.getElementById('splash-status') && (document.getElementById('splash-status').textContent =
        `کتاب ریاضی ۱ پردازش شد: ${fa(stats.chapters)} فصل، ${fa(stats.questions)} سؤال تاییدشده`);
      await new Promise(r => setTimeout(r, 700));
      if (destroyed) return;
      const s = S();
      if (!s.onboarded || !s.profile) nav('onboarding');
      else { bootOnline(); nav('home'); }
    } catch (e) {
      console.error(e);
      toast('خطا در بارگذاری داده‌ها: ' + e.message);
    }
  })();

  async function bootOnline() {
    // auto-register with the server on first online boot (no token yet)
    if (!S().profile?.token) {
      const ok = await registerOnline();
      if (ok) toast('حساب آنلاین ساخته شد — بازی آنلاین فعال شد', { icon: 'wifi' });
    } else {
      ensureSocket();
      autoSync();
    }
  }
  return { node: scr, cleanup() { destroyed = true; } };
}

// ================================================================ ONBOARDING

export function onboardingScreen() {
  const scr = el('div', { class: 'screen' });
  const scroll = el('div', { class: 'scroll no-nav', style: { display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '100%' } });
  scr.append(scroll);

  let step = 0;
  const profile = { name: '', avatar: { base: 'fox', color: AVATAR_COLORS[0] } };

  function render() {
    scroll.innerHTML = '';
    if (step === 0) {
      scroll.append(
        el('div', { class: 'center', style: { padding: '10px 0 20px' } }, mascot('excited', 'happy', 160)),
        el('h1', { class: 'h-display center', text: 'به میدان ریاضی خوش آمدی!' }),
        el('p', { class: 'h-sub center', style: { lineHeight: '2.2' }, html: 'اینجا محل رقابت، تمرین و بزرگ‌شدن در ریاضی پایه دهم است.<br>شش مرحله، هجده سؤال، یک قهرمان!' }),
        el('div', { class: 'grid2', style: { margin: '16px 0' } },
          [['blitz', 'بازی برق‌آسا'], ['ranked', 'جام‌ها و رتبه‌ها'], ['brain', 'بهتر شو در ۱۵'], ['boss', 'نبرد با غول‌ها']].map(([a, t]) =>
            el('div', { class: 'panel tight center', style: { background: '#102A46' } },
              el('div', { html: modeArt(a, 40), style: { margin: '0 auto' } }),
              el('b', { class: 'tiny', text: t })))),
        el('button', { class: 'btn primary big block', text: 'شروع کنیم ←', onclick: () => { sfx.tap(); step = 1; render(); } }));
    } else if (step === 1) {
      const input = el('input', { type: 'text', maxlength: '20', placeholder: 'مثلاً: آرتین ریاضی‌باز', style: { textAlign: 'center', fontSize: '18px' } });
      scroll.append(
        el('div', { class: 'center', style: { padding: '6px 0' } }, mascot('happy', 'idle', 120)),
        el('h2', { class: 'h-display center', text: 'اسمت چیه؟' }),
        el('p', { class: 'h-sub center tiny', text: 'نیازی به نام واقعی نیست؛ یک نام بازی انتخاب کن' }),
        el('div', { class: 'panel paper', style: { padding: '6px' } }, input),
        el('button', {
          class: 'btn primary big block', text: 'بعدی ←',
          onclick: () => {
            const name = input.value.trim();
            if (name.length < 2) { toast('یک اسم بنویس!'); return; }
            profile.name = name;
            sfx.tap(); step = 2; render();
          },
        }));
      setTimeout(() => input.focus(), 300);
    } else {
      scroll.append(
        el('h2', { class: 'h-display center', text: 'آواتارت را بساز' }),
        el('div', { class: 'center', style: { margin: '8px 0' } },
          el('div', { id: 'av-prev', style: { width: '110px', height: '110px', margin: '0 auto' } })),
        el('div', { class: 'card' },
          el('div', { class: 'avatar-grid' },
            AVATAR_BASES.map(b => el('button', {
              class: 'avatar-pick' + (profile.avatar.base === b.id ? ' sel' : ''),
              onclick: () => { profile.avatar.base = b.id; sfx.tap(); render(); },
            }, el('div', { class: 'av', html: avatarSVG(b.id, profile.avatar.color, 64) }), b.name))),
          el('div', { class: 'color-dots', style: { marginTop: '12px' } },
            AVATAR_COLORS.map(c => el('button', {
              class: 'color-dot' + (profile.avatar.color === c ? ' sel' : ''),
              style: { background: c },
              onclick: () => { profile.avatar.color = c; sfx.tap(); render(); },
            })))),
        el('button', {
          class: 'btn primary big block', text: 'ورود به میدان! 🏁',
          onclick: async () => {
            const s = S();
            s.profile = { ...profile, createdAt: Date.now(), token: null, serverUserId: null };
            s.onboarded = true;
            saveNow();
            sfx.victory();
            confetti({ count: 60 });
            // try online registration (non-blocking)
            registerOnline().then(ok => { if (ok) toast('حساب آنلاین ساخته شد — بازی آنلاین فعال شد', { icon: 'wifi' }); });
            nav('home');
          },
        }));
      const prev = scroll.querySelector('#av-prev');
      if (prev) prev.innerHTML = avatarSVG(profile.avatar.base, profile.avatar.color, 110);
    }
  }
  render();
  return { node: scr };
}

// ================================================================ HOME (game hub)

export function homeScreen() {
  const s = S();
  const body = el('div', {});

  // ---- hub head: identity + visual progression (xp ring) ----
  const lvl = s.progress.level;
  const xpNow = s.progress.xp, xpNext = 50 * lvl * (lvl + 1), xpPrev = 50 * (lvl - 1) * lvl;
  const pct = Math.round(100 * (xpNow - xpPrev) / Math.max(1, xpNext - xpPrev));
  const online = window.__maOnline;
  const hubHead = el('div', { class: 'hub-head' },
    el('div', { html: xpRing(lvl, pct, 56), title: 'سطح ' + fa(lvl) }),
    el('div', { class: 'grow' },
      el('div', { class: 'row', style: { gap: '6px' } },
        el('b', { style: { fontSize: '17px' }, text: s.profile?.name || 'مهمان' }),
        el('span', { class: 'pill ' + (online ? 'lime' : ''), style: { fontSize: '10px', padding: '1px 8px' }, text: online ? 'آنلاین' : 'آفلاین' })),
      el('div', { class: 'tiny muted', text: 'ردهٔ محلی ' + fa(s.progress.soloRating) + ' · ' + fa(s.progress.wins) + ' برد' })),
    el('button', {
      class: 'btn ghost small', title: 'اعلان‌ها', html: icon('bell', 20),
      onclick: () => nav('notifications'),
    }));

  // ---- hero: mascot + dominant play ----
  const hero = el('div', { class: 'hero' },
    el('div', { class: 'deco', style: { width: '86px', height: '86px', top: '-28px', right: '-18px' } }),
    el('div', { class: 'deco', style: { width: '38px', height: '38px', bottom: '96px', right: '30%' } }),
    el('div', { class: 'ground' }),
    el('div', { class: 'hero-row' },
      el('div', { class: 'hero-copy' },
        el('h2', { text: 'آمادهٔ نبرد هستی؟' }),
        el('div', { class: 'sub', text: 'شش مرحله · هجده سؤال · یک قهرمان' })),
      el('div', { class: 'mascot-pos' }, mascot('competitive', 'idle', 118))),
    el('button', {
      class: 'play-cta',
      html: `<svg class="ico-big" viewBox="0 0 24 24" fill="#D7E5F2"><path d="M7 4 L19 12 L7 20 Z"/></svg><span>بازی کن</span>`,
      onclick: () => { sfx.tap(); nav('play-hub'); },
    }));

  // ---- featured: daily challenge ----
  const today = new Date().toISOString().slice(0, 10);
  const dailyDone = s.daily.date === today && s.daily.done;
  const featured = el('button', {
    class: 'featured' + (dailyDone ? ' done' : ''),
    onclick: () => nav('daily-challenge'),
  },
    el('span', { class: 'f-glow' }),
    el('span', { class: 'f-art', html: modeArt('daily', 56) }),
    el('span', { class: 'grow', style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' } },
      el('span', { class: 'f-t', text: 'چالش روزانه' }),
      el('span', { class: 'f-s', text: '۸ سؤال از یک فصل کتاب · حدود ۶ دقیقه' })),
    el('span', { class: 'f-tag', text: dailyDone ? 'انجام شد ✓' : '+۶۰ XP' }));

  // ---- mode tiles: GB15 wide + boss + mistakes ----
  const openMistakes = s.mistakes.filter(m => !m.fixed).length;
  const tiles = el('div', { class: 'tile-grid' },
    el('button', {
      class: 'tile wide', style: { '--tile-bg': 'linear-gradient(135deg,#8B5CF6,#6D3FE0)' },
      onclick: () => { sfx.tap(); nav('gb15'); },
    },
      el('span', { class: 't-blob' }),
      el('span', { html: modeArt('brain', 54), style: { flexShrink: '0' } }),
      el('span', { class: 'grow', style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' } },
        el('span', { class: 't-name', text: 'بهتر شو در ۱۵' }),
        el('span', { class: 't-sub', text: 'تشخیص ضعف، تمرین هدفمند، آزمون تسلط' }))),
    el('button', {
      class: 'tile', style: { '--tile-bg': 'linear-gradient(150deg,#FF5D73,#E23B54)' },
      onclick: () => { sfx.tap(); nav('boss-list'); },
    },
      el('span', { html: modeArt('boss', 46), style: { margin: '0 0 4px' } }),
      el('span', { class: 't-name', text: 'نبرد غول‌ها' }),
      el('span', { class: 't-sub', text: '۷ غول، ۳ فاز' })),
    el('button', {
      class: 'tile', style: { '--tile-bg': 'linear-gradient(150deg,#3D9BFF,#1F77D9)' },
      onclick: () => { sfx.tap(); nav('mistakes'); },
    },
      el('span', { html: modeArt('mistakes', 46), style: { margin: '0 0 4px' } }),
      el('span', { class: 't-name', text: 'دفتر اشتباهات' }),
      el('span', { class: 't-sub', text: openMistakes ? fa(openMistakes) + ' اشتباه باز' : 'پاک و تمیز!' })));

  // ---- live games ----
  const lobbyPreview = el('div', { class: 'panel', style: { background: '#0E2033' } });
  const renderLobby = (rooms = [], onlineCount = 0) => {
    lobbyPreview.innerHTML = '';
    lobbyPreview.append(
      el('div', { class: 'row between', style: { marginBottom: '6px' } },
        el('div', { class: 'row', style: { gap: '7px' } },
          el('span', { class: 'live-dot' }),
          el('b', { text: 'بازی‌های زنده' }),
          el('span', { class: 'pill tiny', text: fa(onlineCount) + ' آنلاین' })),
        el('button', { class: 'btn ghost small', text: 'همه', onclick: () => nav('lobby') })));
    if (!rooms.length) {
      lobbyPreview.append(el('div', { class: 'tiny muted', style: { padding: '2px 0 8px' },
        text: isOnline() ? 'فعلاً اتاقی نیست — خودت یکی بساز!' : 'برای بازی زنده به اینترنت وصل شو' }));
      lobbyPreview.append(el('button', {
        class: 'btn blue small block', text: 'ساخت اتاق جدید',
        onclick: () => nav('room-create'),
      }));
    } else {
      for (const r of rooms.slice(0, 2)) {
        lobbyPreview.append(el('div', { class: 'lobby-item', style: { padding: '7px 0', borderTop: '2px dashed rgba(56,189,248,.15)' } },
          el('div', { class: 'mode-ico', style: { background: r.ranked ? '#FFC53D' : '#7BC950' }, text: r.ranked ? '★' : '∞' }),
          el('div', { class: 'grow' },
            el('b', { class: 'tiny', text: r.name }),
            el('div', { class: 'tiny muted', text: `${r.players.length}/${r.capacity} بازیکن · ${r.mode === 'duel' ? 'دوئل' : r.mode} · ${r.ranked ? 'رده‌بندی' : 'دوستانه'}` })),
          el('button', { class: 'btn small lime', text: 'ملحق', onclick: async () => { const a = await emitSock('room:join', { code: r.code }); if (a.ok) nav('waiting-room', { code: r.code, room: a.room }); else toast(a.error); } })));
      }
      lobbyPreview.append(el('button', { class: 'btn ghost small block', text: 'مشاهدهٔ همهٔ اتاق‌ها', onclick: () => nav('lobby') }));
    }
  };
  renderLobby([], 0);
  const unsubLobby = on('srv:lobby:update', (p) => {
    renderLobby(p.rooms || [], p.online || 0);
  });
  emitSock('lobby:sync', {}).then((r) => { if (r.ok) renderLobby(r.rooms || [], r.online || 0); });

  // ---- progression strip (visual, compact) ----
  const st = s.stats;
  const acc = st.answered ? Math.round(100 * st.correct / st.answered) : 0;
  const skillsGrowing = Object.keys(s.mastery).filter(k => k !== '__recent').length;
  const prog = el('div', { class: 'panel paper' },
    el('div', { class: 'row between', style: { marginBottom: '6px' } },
      el('b', { class: 'tiny', text: 'مسیر یادگیری' }),
      el('button', { class: 'btn ghost small', text: 'مسیر تمرین ←', onclick: () => nav('practice') })),
    el('div', { class: 'row', style: { gap: '14px' } },
      el('div', { class: 'center grow' },
        el('div', { class: 'num', style: { fontSize: '19px', color: 'var(--blue-deep)' }, text: fa(st.answered) }),
        el('div', { class: 'tiny muted', text: 'سؤال' })),
      el('div', { style: { width: '2px', background: 'rgba(56,189,248,.15)', borderRadius: '2px' } }),
      el('div', { class: 'center grow' },
        el('div', { class: 'num', style: { fontSize: '19px', color: 'var(--lime-deep)' }, text: fa(acc) + '٪' }),
        el('div', { class: 'tiny muted', text: 'دقت' })),
      el('div', { style: { width: '2px', background: 'rgba(56,189,248,.15)', borderRadius: '2px' } }),
      el('div', { class: 'center grow' },
        el('div', { class: 'num', style: { fontSize: '19px', color: 'var(--purple-deep)' }, text: fa(skillsGrowing) }),
        el('div', { class: 'tiny muted', text: 'مهارت در رشد' }))));

  body.append(hubHead, hero, featured, tiles,
    el('div', { class: 'sec-head', style: { '--acc': 'var(--blue)' } }, el('span', { text: 'رقابت زنده' })),
    lobbyPreview, prog,
    el('div', { class: 'tiny muted center', style: { padding: '6px 0 10px' }, text: 'همهٔ سؤال‌ها از کتاب ریاضی ۱ پایه دهم تولید و صحت‌سنجی شده‌اند' }));

  const node = screenScaffold({ active: 'home', connBanner: true, body, scene: sceneBand({ height: 112 }) });
  return { node, cleanup() { unsubLobby(); } };
}

// ================================================================ PLAY HUB (arcade wall)

/** shared arcade tile for a solo mode */
export function soloTile(modeId) {
  const s = S();
  const cfg = SOLO_MODES[modeId];
  const rec = s.records[cfg.name === 'بقا' ? 'survival' : modeId];
  return el('button', {
    class: 'tile', style: { '--tile-bg': `linear-gradient(150deg, ${cfg.color}, ${shade(cfg.color)})`, minHeight: '118px' },
    onclick: () => { sfx.tap(); nav('solo', { mode: modeId }); },
  },
    el('span', { class: 't-blob' }),
    el('span', { html: modeArt(modeId === 'survivalPractice' ? 'sprout' : modeId, 46), style: { margin: '0 0 4px' } }),
    el('span', { class: 't-name', text: cfg.name }),
    el('span', { class: 't-sub', text: cfg.desc }),
    rec ? el('span', { class: 't-rec', text: 'رکورد ' + fa(rec.score) }) : null);
}

function shade(hex) {
  const m = /^#(..)(..)(..)$/.exec(hex);
  if (!m) return hex;
  const d = (h) => Math.max(0, Math.round(parseInt(h, 16) * 0.72)).toString(16).padStart(2, '0');
  return '#' + d(m[1]) + d(m[2]) + d(m[3]);
}

export function playHubScreen() {
  const body = el('div', { class: 'col', style: { gap: '11px' } });
  const online = isOnline();
  const onlineGo = (fn) => () => {
    sfx.tap();
    if (!online) { toast('برای بازی آنلاین، اول سرور را در تنظیمات وارد کن', { icon: 'wifi' }); return; }
    fn();
  };

  const duelTiles = el('div', { class: 'tile-grid' },
    el('button', {
      class: 'tile', style: { '--tile-bg': 'linear-gradient(150deg,#FFC53D,#F0A722)', minHeight: '128px' },
      onclick: onlineGo(() => nav('matchmaking', { ranked: true })),
    },
      el('span', { class: 't-blob' }),
      el('span', { html: modeArt('ranked', 48), style: { margin: '0 0 4px' } }),
      el('span', { class: 't-name', text: 'دوئل رده‌بندی' }),
      online ? el('span', { class: 't-sub', text: 'ردهٔ رسمی تو تغییر می‌کند' }) : null,
      !online ? el('span', { class: 'lock-veil' }, el('span', { class: 'lk', html: lockSVG(24) }), el('span', { text: 'نیاز به اتصال' })) : null),
    el('button', {
      class: 'tile', style: { '--tile-bg': 'linear-gradient(150deg,#3D9BFF,#1F77D9)', minHeight: '128px' },
      onclick: onlineGo(() => nav('matchmaking', { ranked: false })),
    },
      el('span', { class: 't-blob' }),
      el('span', { html: modeArt('quick', 48), style: { margin: '0 0 4px' } }),
      el('span', { class: 't-name', text: 'دوئل سریع' }),
      online ? el('span', { class: 't-sub', text: 'هرچه سریع‌تر حریف پیدا شود' }) : null,
      !online ? el('span', { class: 'lock-veil' }, el('span', { class: 'lk', html: lockSVG(24) }), el('span', { text: 'نیاز به اتصال' })) : null),
    el('button', {
      class: 'tile wide', style: { '--tile-bg': 'linear-gradient(120deg,#8B5CF6,#6D3FE0)' },
      onclick: onlineGo(() => nav('friends')),
    },
      el('span', { class: 't-blob' }),
      el('span', { html: modeArt('friendly', 52), style: { flexShrink: '0' } }),
      el('span', { class: 'grow', style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' } },
        el('span', { class: 't-name', text: 'چالش دوستانه' }),
        online ? el('span', { class: 't-sub', text: 'دوئل خصوصی با یک دوست' }) : null),
      !online ? el('span', { class: 'lock-veil' }, el('span', { class: 'lk', html: lockSVG(24) }), el('span', { text: 'نیاز به اتصال' })) : null));

  const roomRow = el('div', { class: 'grid2', style: { gap: '11px' } },
    el('button', {
      class: 'tile light', style: { '--tile-bg': '#E2F6F3', minHeight: '86px', flexDirection: 'row', alignItems: 'center', gap: '10px' },
      onclick: onlineGo(() => nav('room-create')),
    },
      el('span', { html: modeArt('room', 44), style: { flexShrink: '0' } }),
      el('span', { class: 'grow', style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start' } },
        el('span', { class: 't-name', text: 'ساخت اتاق' }),
        online ? el('span', { class: 't-sub', text: 'با کد اتاق بازی کن' }) : null),
      !online ? el('span', { class: 'lock-veil' }, el('span', { class: 'lk', html: lockSVG(24) }), el('span', { text: 'نیاز به اتصال' })) : null),
    el('button', {
      class: 'tile light', style: { '--tile-bg': '#FFF0E0', minHeight: '86px', flexDirection: 'row', alignItems: 'center', gap: '10px' },
      onclick: onlineGo(() => nav('room-join')),
    },
      el('span', { html: modeArt('key', 44), style: { flexShrink: '0' } }),
      el('span', { class: 'grow', style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start' } },
        el('span', { class: 't-name', text: 'ملحق به اتاق' }),
        online ? el('span', { class: 't-sub', text: 'کد اتاق را دارم' }) : null),
      !online ? el('span', { class: 'lock-veil' }, el('span', { class: 'lk', html: lockSVG(24) }), el('span', { text: 'نیاز به اتصال' })) : null));

  const offlineTiles = el('div', { class: 'tile-grid' },
    el('button', {
      class: 'tile wide', style: { '--tile-bg': 'linear-gradient(135deg,#FF8A3D,#E86F1D)' },
      onclick: () => { sfx.tap(); nav('bot-setup'); },
    },
      el('span', { class: 't-blob' }),
      el('span', { html: modeArt('bot', 56), style: { flexShrink: '0' } }),
      el('span', { class: 'grow', style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' } },
        el('span', { class: 't-name', text: 'دوئل با ربات جبرو' }),
        el('span', { class: 't-sub', text: 'شش مرحله کامل در برابر هوش مصنوعی' }))),
    el('button', {
      class: 'tile', style: { '--tile-bg': 'linear-gradient(150deg,#FF8A3D,#E86F1D)' },
      onclick: () => { sfx.tap(); nav('duel', { online: false, config: { passAndPlay: true } }); },
    },
      el('span', { html: modeArt('passplay', 46), style: { margin: '0 0 4px' } }),
      el('span', { class: 't-name', text: 'دو نفره روی یک گوشی' }),
      el('span', { class: 't-sub', text: 'رد و بدل کردن نوبت' })));

  const soloGrid = el('div', { class: 'tile-grid' },
    ['blitz', 'survival', 'survivalPractice', 'marathon', 'precision', 'record'].map(soloTile));

  const head = el('div', { class: 'row', style: { gap: '10px', margin: '2px 0 2px' } },
    el('div', { style: { width: '58px', height: '58px', flexShrink: '0', marginTop: '-6px' } }, mascot('excited', 'happy', 58)),
    el('div', {},
      el('h2', { class: 'h-display', style: { marginBottom: '2px' }, text: 'میدان بازی' }),
      el('div', { class: 'tiny muted', text: 'هر حالت، یک بازی متفاوت است — انتخاب کن' })));

  body.append(
    head,
    secHead('دوئل آنلاین', { accent: online ? 'var(--lime)' : 'var(--coral)', count: online ? 'متصل' : 'آفلاین' }),
    duelTiles, roomRow,
    secHead('آفلاین', { accent: 'var(--orange)' }),
    offlineTiles,
    el('div', { class: 'tiny muted center', style: { padding: '2px 4px' }, text: 'نتایج آفلاین روی ردهٔ آنلاین اثر نمی‌گذارد و بعد از اتصال همگام می‌شود.' }),
    secHead('آرنتای تکی', { accent: 'var(--purple)' }),
    soloGrid);

  return { node: screenScaffold({ active: 'play', body }) };
}

// ================================================================ BOT SETUP

export function botSetupScreen() {
  let lvl = 2;
  const body = el('div', {});
  const render = () => {
    body.innerHTML = '';
    const levels = ['تازه‌کار', 'آماتور', 'معمولی', 'حرفه‌ای', 'استاد'];
    body.append(
      el('div', { class: 'card center', style: { background: 'linear-gradient(165deg,#F4ECFF,#EDE2FF)' } },
        el('div', { style: { width: '128px', height: '128px', margin: '0 auto' } }, mascot('competitive', 'idle', 128)),
        el('h3', { class: 'h-title', text: 'دوئل با ربات جبرو' }),
        el('p', { class: 'tiny muted', text: 'سطح ربات را انتخاب کن — ردهٔ محلی تو با هر بازی تنظیم می‌شود' })),
      el('div', { class: 'panel paper' },
        el('b', { text: 'سطح ربات: ' + levels[lvl - 1] }),
        el('div', { class: 'row', style: { marginTop: '10px', gap: '6px' } },
          [1, 2, 3, 4, 5].map(i => el('button', {
            class: 'btn small grow ' + (i === lvl ? 'primary' : 'ghost'), text: fa(i),
            onclick: () => { lvl = i; sfx.tap(); render(); },
          }))),
        el('button', {
          class: 'btn primary big block', style: { marginTop: '14px' }, text: 'شروع دوئل ←',
          onclick: () => nav('duel', { online: false, config: { vsBot: true, botLevel: lvl } }),
        })));
  };
  render();
  return { node: screenScaffold({ active: 'play', body, back: 'play-hub' }) };
}

// ================================================================ OFFLINE HUB

export function offlineHubScreen() {
  const body = el('div', { class: 'col', style: { gap: '11px' } });
  body.append(el('div', { class: 'tile-grid' },
    ['blitz', 'survival', 'survivalPractice', 'marathon', 'precision', 'record'].map(soloTile)));
  body.append(el('div', { class: 'tiny muted center', style: { padding: '4px' }, text: 'نتایج آفلاین روی ردهٔ آنلاین اثر نمی‌گذارد و بعد از اتصال همگام می‌شود.' }));
  return { node: screenScaffold({ active: 'play', body, back: 'play-hub' }) };
}

// ================================================================ LIVE LOBBY

export function lobbyScreen() {
  const body = el('div', {});
  let filter = 'all';
  let rooms = [];

  const filters = [
    { id: 'all', label: 'همه' }, { id: 'ranked', label: 'رده‌بندی' }, { id: 'casual', label: 'دوستانه' },
    { id: 'friends', label: 'دوستان' }, { id: 'chapter', label: 'فصلی' },
  ];
  const chipRow = el('div', { class: 'filters' },
    filters.map(f => el('button', {
      class: 'filter-chip' + (filter === f.id ? ' active' : ''),
      text: f.label,
      onclick: () => { filter = f.id; sfx.tap(); render(); },
    })));

  const list = el('div', { class: 'col' });
  function render() {
    chipRow.querySelectorAll('.filter-chip').forEach((c, i) => c.classList.toggle('active', filters[i].id === filter));
    list.innerHTML = '';
    let shown = rooms;
    if (filter === 'ranked') shown = rooms.filter(r => r.ranked);
    if (filter === 'casual') shown = rooms.filter(r => !r.ranked);
    if (filter === 'chapter') shown = rooms.filter(r => r.chapter && r.chapter !== 'mixed');
    if (filter === 'friends') shown = rooms.filter(r => r.players.some(p => (S().profile?.friends || []).includes(p.userId)));
    if (!shown.length) {
      list.append(emptyState('balloon', 'اتاقی با این فیلتر نیست', 'اتاق بساز یا فیلتر را عوض کن'));
    }
    for (const r of shown) {
      const full = r.players.length >= r.capacity;
      list.append(el('div', { class: 'panel tight lobby-item' },
        el('div', { class: 'mode-ico', style: { background: r.ranked ? '#FFC53D' : '#7BC950' }, text: r.ranked ? '★' : '∞' }),
        el('div', { class: 'grow' },
          el('b', { text: r.name }),
          el('div', { class: 'tiny muted', text: `${r.mode === 'duel' ? 'دوئل' : r.mode === 'team' ? 'تیمی' : r.mode} · ${r.players.length}/${r.capacity} بازیکن${r.chapter !== 'mixed' ? ' · فصل ' + fa(Number(r.chapter.replace('ch', ''))) : ''}` }),
          el('div', { class: 'row tiny', style: { gap: '4px', marginTop: '3px' } },
            r.players.map(p => el('span', { class: 'pill', style: { padding: '1px 7px', fontSize: '10px' }, text: p.name })),
            r.players.map(p => p.userId).includes(r.hostId) && el('span', { class: 'pill purple', style: { padding: '1px 7px', fontSize: '10px' }, text: 'میزبان: ' + (r.players.find(p => p.userId === r.hostId)?.name || '') }))),
        el('button', {
          class: 'btn small ' + (full ? 'ghost' : 'lime'), text: full ? 'پر' : 'ملحق',
          disabled: full,
          onclick: async () => {
            const a = await emitSock('room:join', { code: r.code });
            if (a.ok) nav('waiting-room', { code: r.code, room: a.room });
            else toast(a.error === 'room-full' ? 'اتاق پر است' : 'اتاق در حال بازی است');
          },
        })));
    }
  }
  render();

  const unsub = on('srv:lobby:update', (p) => {
    rooms = p.rooms || [];
    render();
  });
  emitSock('lobby:sync', {}).then((r) => { if (r.ok) { rooms = r.rooms || []; render(); } });

  body.append(
    el('div', { class: 'row', style: { gap: '8px', marginBottom: '10px' } },
      el('button', { class: 'btn blue grow', html: icon('plus', 18) + ' ساخت اتاق', onclick: () => nav('room-create') }),
      el('button', { class: 'btn grow', html: icon('key', 18) + ' کد اتاق دارم', onclick: () => nav('room-join') })),
    chipRow, list,
    el('div', { class: 'tiny muted center', style: { padding: '8px' }, text: 'اتاق‌ها به‌صورت زنده به‌روز می‌شوند' }));

  return {
    node: screenScaffold({ active: 'play', body, back: 'play-hub' }),
    cleanup() { unsub(); },
  };
}

// ================================================================ ROOM CREATE / JOIN

export function roomCreateScreen() {
  let cfg = { name: '', mode: 'duel', chapter: 'mixed', ranked: false, capacity: 2 };
  const body = el('div', {});
  const render = () => {
    body.innerHTML = '';
    const nameInput = el('input', { type: 'text', maxlength: '30', placeholder: 'نام اتاق (اختیاری)', value: cfg.name });
    nameInput.oninput = () => cfg.name = nameInput.value;
    body.append(
      el('div', { class: 'panel paper' }, el('b', { class: 'tiny', text: 'نام اتاق' }), nameInput),
      el('div', { class: 'panel paper' },
        el('b', { class: 'tiny', text: 'نوع بازی' }),
        el('div', { class: 'row', style: { marginTop: '8px' } },
          [{ id: 'duel', t: 'دوئل' }, { id: 'team', t: 'تیمی ۲v۲' }].map(m =>
            el('button', {
              class: 'btn small grow ' + (cfg.mode === m.id ? 'primary' : 'ghost'), text: m.t,
              onclick: () => { cfg.mode = m.id; cfg.capacity = m.id === 'team' ? 4 : 2; render(); },
            })))),
      el('div', { class: 'panel paper' },
        el('b', { class: 'tiny', text: 'فصل' }),
        el('div', { class: 'chip-row', style: { marginTop: '8px' } },
          [{ id: 'mixed', t: 'ترکیبی' }, ...[1, 2, 3, 4, 5, 6, 7].map(i => ({ id: 'ch' + i, t: 'فصل ' + fa(i) }))].map(c =>
            el('button', {
              class: 'filter-chip' + (cfg.chapter === c.id ? ' active' : ''), text: c.t,
              onclick: () => { cfg.chapter = c.id; render(); },
            })))),
      el('div', { class: 'panel paper' },
        el('div', { class: 'setting-row' },
          el('b', { text: 'بازی رده‌بندی' }),
          el('label', { class: 'switch' }, el('input', { type: 'checkbox', checked: cfg.ranked, onchange: (e) => cfg.ranked = e.target.checked }), el('i', {})))),
      el('button', {
        class: 'btn primary big block', text: 'ساخت اتاق ←',
        onclick: async () => {
          const ack = await emitSock('room:create', cfg);
          if (ack.ok) nav('waiting-room', { code: ack.room.code, room: ack.room, host: true });
          else toast('خطا در ساخت اتاق');
        },
      }));
  };
  render();
  return { node: screenScaffold({ active: 'play', body, back: 'lobby' }) };
}

export function roomJoinScreen() {
  const input = el('input', { type: 'text', placeholder: 'مثلاً R7KQM', style: { textAlign: 'center', fontSize: '22px', letterSpacing: '3px', direction: 'ltr' }, maxlength: '6' });
  const body = el('div', { class: 'col' },
    el('div', { class: 'card center' },
      el('div', { html: modeArt('key', 64), style: { width: '64px', height: '64px', margin: '0 auto 6px' } }),
      el('b', { text: 'کد اتاق را وارد کن' }),
      el('div', { style: { margin: '12px 0' } }, input),
      el('button', {
        class: 'btn primary block', text: 'ملحق شو',
        onclick: async () => {
          const code = input.value.trim().toUpperCase();
          if (code.length < 4) { toast('کد را کامل وارد کن'); return; }
          const ack = await emitSock('room:join', { code });
          if (ack.ok) nav('waiting-room', { code, room: ack.room });
          else toast(ack.error === 'room-not-found' ? 'اتاقی با این کد پیدا نشد' : 'امکان ملحق شدن نیست: ' + ack.error);
        },
      })));
  return { node: screenScaffold({ active: 'play', body, back: 'lobby' }) };
}

// ================================================================ WAITING ROOM

export function waitingRoomScreen(params) {
  const body = el('div', {});
  let room = params.room || null;
  let isHost = params.host || false;
  let started = false;

  function render() {
    body.innerHTML = '';
    body.append(
      el('div', { class: 'card center', style: { background: 'linear-gradient(165deg,#102A46,#0D2338)' } },
        mascot('happy', 'idle', 96),
        el('h3', { class: 'h-title', text: room?.name || 'اتاق' }),
        el('div', { class: 'pill gold', style: { margin: '6px auto', display: 'inline-block' }, text: 'کد اتاق: ' + (params.code || '') }),
        el('div', { class: 'tiny muted', text: 'کد را برای دوستانت بفرست تا ملحق شوند' })),
      el('div', { class: 'panel paper' },
        el('b', { class: 'tiny', text: 'بازیکن‌ها (' + fa(room?.players.length || 1) + '/' + fa(room?.capacity || 2) + ')' }),
        el('div', { class: 'col', style: { marginTop: '10px', gap: '8px' } },
          (room?.players || []).map(p => el('div', { class: 'row' },
            avatarView(p.avatar, 40),
            el('div', { class: 'grow' }, el('b', { class: 'tiny', text: p.name })),
            p.ready ? el('span', { class: 'pill lime', text: 'آماده ✓' }) : el('span', { class: 'pill', text: 'در انتظار...' }),
            p.userId === room.hostId && el('span', { class: 'pill purple', text: 'میزبان' }))),
          ...Array.from({ length: Math.max(0, (room?.capacity || 2) - (room?.players.length || 1)) }, () =>
            el('div', { class: 'row', style: { opacity: '.5' } },
              el('div', { class: 'list-ico', style: { background: '#163956' }, html: icon('profile', 20, '#56698A') }),
              el('span', { class: 'tiny muted', text: 'جای خالی — منتظر بازیکن...' }))))),
      el('div', { class: 'row' },
        el('button', {
          class: 'btn grow ' + ((room?.players || []).find(p => p.userId === S().profile?.serverUserId)?.ready ? 'ghost' : 'lime'),
          text: (room?.players || []).find(p => p.userId === S().profile?.serverUserId)?.ready ? 'آماده‌ام (لغو)' : 'آماده می‌شوم',
          onclick: async () => {
            const me = (room?.players || []).find(p => p.userId === S().profile?.serverUserId);
            const ack = await emitSock('room:ready', { code: params.code, ready: !(me?.ready) });
            if (!ack.ok) toast('خطا');
          },
        }),
        isHost && el('button', {
          class: 'btn primary grow', text: 'شروع بازی 🏁',
          onclick: async () => {
            const ack = await emitSock('room:start', { code: params.code });
            if (!ack.ok) toast(ack.error === 'need-more-players' ? 'بازیکن بیشتری لازم است' : 'خطا در شروع');
            // navigation happens on room:started event
          },
        })),
      el('button', {
        class: 'btn ghost block', text: 'خروج از اتاق',
        onclick: async () => { await emitSock('room:leave', { code: params.code }); nav('lobby'); },
      }));
  }
  render();

  const unsubs = [
    on('srv:room:player_joined', (p) => { if (p.code === params.code) { room = { ...room, players: p.players }; sfx.friendJoin(); render(); } }),
    on('srv:room:player_left', (p) => { if (p.code === params.code) { room = { ...room, players: p.players }; render(); } }),
    on('srv:room:ready', (p) => { if (p.code === params.code) { room = { ...room, players: p.players }; render(); } }),
    on('srv:room:started', (p) => {
      if (p.code !== params.code) return;
      started = true;
      sfx.matchStart();
      nav('duel', { online: true, matchId: p.matchIds[0] });
    }),
    on('srv:match:found', (p) => { if (!started) { started = true; nav('duel', { online: true, matchId: p.matchId, opponent: p.opponent }); } }),
  ];

  return { node: screenScaffold({ active: 'play', body, noNav: true }), cleanup() { unsubs.forEach(u => u()); } };
}

// ================================================================ MATCHMAKING (radar)

export function matchmakingScreen(params) {
  const ranked = !!params.ranked;
  const body = el('div', { class: 'col', style: { minHeight: '62vh', justifyContent: 'center' } });

  const radar = el('div', { class: 'radar' },
    el('span', { class: 'r-ring' }), el('span', { class: 'r-ring r2' }), el('span', { class: 'r-ring r3' }),
    el('span', { class: 'r-sweep' }),
    el('span', { class: 'r-core' }, mascot('thinking', 'think', 92)));

  body.append(
    radar,
    el('h2', { class: 'h-display center', text: ranked ? 'در جست‌وجوی حریف رده‌بندی...' : 'در جست‌وجوی حریف...' }),
    el('p', { class: 'h-sub center tiny', text: ranked ? 'پنجرهٔ جست‌وجو به‌مرور بزرگ‌تر می‌شود' : 'دوئل دوستانه — رده تغییر نمی‌کند' }),
    el('div', { class: 'tiny muted center', id: 'mm-time', text: '۰ ثانیه' }));

  const t0 = Date.now();
  const timeTimer = setInterval(() => {
    const elx = body.querySelector('#mm-time');
    if (elx) elx.textContent = fa(Math.floor((Date.now() - t0) / 1000)) + ' ثانیه';
  }, 1000);

  let cancelled = false;
  (async () => {
    const ack = await emitSock('match:queue', { ranked, chapter: 'mixed' });
    if (!ack.ok) { toast('خطا در صف'); nav('play-hub'); return; }
    sfx.matchmaking();
  })();

  const unsub = on('srv:match:found', (p) => {
    if (cancelled) return;
    clearInterval(timeTimer);
    sfx.matchStart();
    confetti({ count: 40, duration: 1200 });
    nav('duel', { online: true, matchId: p.matchId, opponent: p.opponent });
  });

  body.append(el('button', {
    class: 'btn coral block', style: { marginTop: '20px' }, text: 'لغو',
    onclick: async () => {
      cancelled = true;
      clearInterval(timeTimer);
      await emitSock('match:cancel_queue', {});
      nav('play-hub');
    },
  }));

  return {
    node: screenScaffold({ active: 'play', title: '', body, noNav: true }),
    cleanup() { cancelled = true; clearInterval(timeTimer); unsub(); emitSock('match:cancel_queue', {}); },
  };
}

// ================================================================ SETTINGS

export function settingsScreen() {
  const s = S();
  const body = el('div', { class: 'col' });

  const urlInput = el('input', { type: 'url', value: s.settings.serverUrl, placeholder: 'http://192.168.1.10:8080', dir: 'ltr' });
  urlInput.onchange = () => { s.settings.serverUrl = urlInput.value.trim().replace(/\/+$/, ''); save(); };
  const status = el('div', { class: 'tiny muted', id: 'srv-status', text: 'بررسی نشده' });

  body.append(
    secHead('اتصال به سرور بازی', { accent: 'var(--blue)' }),
    el('div', { class: 'panel paper' },
      el('p', { class: 'tiny muted', style: { margin: '0 0 8px' }, text: 'آدرس سرور میدان ریاضی را وارد کن (مثلاً روی همان وای‌فای)' }),
      urlInput,
      el('div', { class: 'row', style: { marginTop: '8px' } },
        el('button', {
          class: 'btn blue small grow', text: 'تست اتصال',
          onclick: async () => {
            status.textContent = 'در حال بررسی...';
            const r = await probeServer();
            if (r.ok) { status.textContent = `متصل ✓ — ${fa(r.health.questions)} سؤال، ${fa(r.health.online)} آنلاین`; sfx.correct(); }
            else { status.textContent = 'اتصال برقرار نشد: ' + r.error; sfx.wrong(); }
          },
        }),
        el('button', {
          class: 'btn small grow', text: 'اتصال مجدد',
          onclick: async () => {
            const { disconnectSocket } = await import('./net.js');
            disconnectSocket();
            ensureSocket();
            if (!s.profile?.token) await registerOnline();
            else ensureSocket();
            toast('تلاش برای اتصال مجدد');
            setTimeout(() => nav('settings'), 600);
          },
        })),
      status),
    secHead('صدا و لمس', { accent: 'var(--orange)' }),
    el('div', { class: 'panel paper' },
      el('div', { class: 'setting-row' }, el('span', { text: 'جلوه‌های صوتی' }), el('input', { type: 'range', min: '0', max: '1', step: '0.05', value: s.settings.sound, oninput: (e) => { s.settings.sound = +e.target.value; save(); sfx.tap(); } })),
      el('div', { class: 'setting-row' }, el('span', { text: 'موسیقی' }), el('input', { type: 'range', min: '0', max: '1', step: '0.05', value: s.settings.music, oninput: (e) => { s.settings.music = +e.target.value; save(); } })),
      el('div', { class: 'setting-row' }, el('span', { text: 'لرزش (لمس)' }), el('label', { class: 'switch' }, el('input', { type: 'checkbox', checked: s.settings.haptics, onchange: (e) => { s.settings.haptics = e.target.checked; save(); } }), el('i', {}))),
      el('div', { class: 'setting-row' }, el('span', { text: 'کاهش انیمیشن' }), el('label', { class: 'switch' }, el('input', { type: 'checkbox', checked: s.settings.reducedMotion, onchange: (e) => { s.settings.reducedMotion = e.target.checked; document.body.classList.toggle('reduced-motion', e.target.checked); save(); } }), el('i', {}))),
      el('div', { class: 'setting-row' }, el('span', { text: 'تختهٔ خط‌کشی در سؤال‌ها' }), el('label', { class: 'switch' }, el('input', { type: 'checkbox', checked: s.settings.whiteboard !== false, onchange: (e) => { s.settings.whiteboard = e.target.checked; save(); } }), el('i', {}))),
      el('div', { class: 'setting-row' }, el('span', { text: 'نشان مرجع کتاب درسی' }), el('label', { class: 'switch' }, el('input', { type: 'checkbox', checked: s.settings.textbookBadge !== false, onchange: (e) => { s.settings.textbookBadge = e.target.checked; save(); } }), el('i', {}))),
      el('div', { class: 'setting-row' }, el('span', { text: 'موسیقی پس‌زمینه' }),
        el('button', { class: 'btn small ' + (document.body.classList.contains('music-on') ? 'coral' : 'lime'), text: document.body.classList.contains('music-on') ? 'خاموش' : 'روشن', onclick: (e) => { const on = !document.body.classList.contains('music-on'); document.body.classList.toggle('music-on', on); on ? startMusic() : stopMusic(); e.target.textContent = on ? 'خاموش' : 'روشن'; e.target.className = 'btn small ' + (on ? 'coral' : 'lime'); } }))),
    secHead('داده‌ها', { accent: 'var(--coral)' }),
    el('div', { class: 'panel paper' },
      el('div', {
        class: 'tiny muted', style: { lineHeight: '2.1' },
        html: `پروفایل: ${s.profile?.name || '-'} · سطح ${fa(s.progress.level)} · XP ${fa(s.progress.xp)}<br>` +
          `سؤال‌های پاسخ‌داده: ${fa(s.stats.answered)} · دقت ${fa(s.stats.answered ? Math.round(100 * s.stats.correct / s.stats.answered) : 0)}٪ · جلسه‌های در انتظار همگام‌سازی: ${fa(s.pendingSessions.length)}`,
      }),
      el('div', { class: 'row', style: { marginTop: '10px' } },
        el('button', {
          class: 'btn blue small grow', text: 'همگام‌سازی دستی',
          onclick: async () => { const r = await syncPending(); toast(r.synced ? fa(r.synced) + ' جلسه همگام شد' : 'چیزی برای همگام‌سازی نیست'); },
        }),
        el('button', {
          class: 'btn coral small grow', text: 'پاک‌کردن همهٔ داده‌ها',
          onclick: () => {
            scrModal();
          },
        }))),
    el('div', { class: 'tiny muted center', style: { padding: '6px' }, text: 'میدان ریاضی نسخهٔ ۱٫۰٫۰ — همهٔ محتوا از کتاب ریاضی ۱ پایه دهم' }));

  function scrModal() {
    const m = modal({
      title: 'مطمئنی؟',
      body: el('p', { text: 'همهٔ پیشرفت، پروفایل و آمار محلی پاک می‌شود. این کار برگشت‌پذیر نیست!' }),
      actions: [
        { label: 'بله، پاک کن', cls: 'coral', fn: () => { resetAll(); location.reload(); } },
        { label: 'نه', cls: '' },
      ],
    });
    document.getElementById('app').append(m);
  }

  return { node: screenScaffold({ active: 'profile', body }) };
}

// ================================================================ NOTIFICATIONS

export function notificationsScreen() {
  const s = S();
  const body = el('div', { class: 'col' });
  const local = s.notifications.slice(0, 40);
  if (!local.length) {
    body.append(emptyState('bell', 'فعلاً خبری نیست', 'دعوت‌ها، جام‌ها و دستاوردها اینجا نشان داده می‌شوند'));
  }
  for (const n of local) {
    body.append(el('div', { class: 'panel tight row' + (n.read ? '' : ''), style: n.read ? {} : { background: '#0E2033' } },
      el('div', { class: 'list-ico', style: { background: '#3D9BFF' }, html: icon('bell', 18, '#fff') }),
      el('div', { class: 'grow' }, el('b', { class: 'tiny', text: n.text }), el('div', { class: 'tiny muted', text: new Date(n.ts).toLocaleString('fa-IR') }))));
  }
  body.append(el('button', {
    class: 'btn ghost block', text: 'علامت‌گذاری همه به‌عنوان خوانده‌شده',
    onclick: () => { s.notifications.forEach(n => n.read = true); save(); nav('notifications'); },
  }));
  return { node: screenScaffold({ active: 'profile', body }) };
}

// ================================================================ DAILY CHALLENGE

export function dailyChallengeScreen() {
  const s = S();
  const today = new Date().toISOString().slice(0, 10);
  const body = el('div', {});

  if (s.daily.date === today && s.daily.done) {
    body.append(
      el('div', { class: 'card center', style: { background: 'linear-gradient(165deg,#EDFBF1,#DFF5D3)' } },
        mascot('celebrating', 'happy', 120),
        el('h3', { class: 'h-title', text: 'چالش امروز را انجام دادی!' }),
        el('div', { class: 'stat-grid' },
          el('div', { class: 'stat-box' }, el('div', { class: 'v', text: fa(s.daily.score) }), el('div', { class: 'k', text: 'امتیاز' }))),
        el('p', { class: 'tiny muted', text: 'فردا چالش تازه‌ای منتظرت است' })));
    return { node: screenScaffold({ active: 'home', body }) };
  }

  // local fallback: deterministic question set by date
  import('./data.js').then(({ pickFromPool, getBank }) => {
    const day = today;
    const chapters = ['ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'ch7'];
    const ch = chapters[new Date(day + 'T00:00:00Z').getUTCDate() % 7];
    const qs = pickFromPool(getBank().questions.filter(q => q.chapterId === ch), 8, 'daily-' + day);
    const { createSoloRun, soloNextQuestion, soloAnswer, soloIsOver, soloFinish } = window.__ma_game;
    const run = createSoloRun({ mode: 'blitz', chapterFilter: ch, seed: 'daily-' + day });
    run.questionCount = 8; run.mode = 'precision'; run.realMode = 'daily';
    body.innerHTML = '';
    body.append(
      el('div', { class: 'card', style: { background: 'linear-gradient(165deg,#FFF6E0,#FFEFC7)' } },
        el('div', { class: 'row' },
          el('span', { html: modeArt('daily', 56), style: { flexShrink: '0' } }),
          el('div', { class: 'grow' },
            el('b', { style: { fontSize: '17px' }, text: 'چالش روزانه ' + fa(day.replace(/-/g, '/')) }),
            el('div', { class: 'tiny muted', text: '۸ سؤال از یک فصل کتاب · حدود ۶ دقیقه · +۶۰ XP' }))),
        el('button', { class: 'btn primary big block', style: { marginTop: '14px' }, text: 'شروع چالش ←', onclick: () => nav('solo', { mode: 'precision', chapterFilter: ch, daily: { day } }) })),
      el('div', { class: 'panel row', style: { background: '#0E2033' } },
        el('div', { style: { width: '56px', height: '56px', flexShrink: '0' } }, mascot('happy', 'idle', 56)),
        el('div', { class: 'grow', style: { lineHeight: '2' } },
          el('b', { class: 'tiny', text: 'چطور کار می‌کند؟' }),
          el('div', { class: 'tiny muted', text: 'هر روز یک فصل تازه انتخاب می‌شود — همان روز انجامش بده تا XP کامل را بگیری. فردا چالش تازه‌ای منتظرت است!' }))));
  });

  body.append(el('div', { class: 'center muted tiny' }, 'در حال آماده‌سازی چالش...'));
  return { node: screenScaffold({ active: 'home', body }) };
}
