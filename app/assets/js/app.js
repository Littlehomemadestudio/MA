// MATH ARENA - app bootstrap: registers all routes, wires global events.
import { route, nav, on, S, save, fa } from './core.js';
import { sfx } from './audio.js';
import { toast, confetti, mascot, modal } from './ui.js';
import * as UI from './ui.js';
import * as GAME from './game.js';
import { loadData } from './data.js';
import { ensureSocket, isOnline, autoSync, registerOnline, syncPending } from './net.js';

// expose for screens that import lazily
window.__ma_ui = UI;
window.__ma_game = GAME;
window.__maNav = nav;   // QA/testing hook (also used by WebView simulation tests)

// ---- home & flow ----
import { splashScreen, onboardingScreen, homeScreen, playHubScreen, botSetupScreen, offlineHubScreen, lobbyScreen, roomCreateScreen, roomJoinScreen, waitingRoomScreen, matchmakingScreen, settingsScreen, notificationsScreen, dailyChallengeScreen } from './screens-home.js';
// ---- gameplay ----
import { duelScreen, soloScreen, bossScreen, resultsScreen } from './screens-game.js';
// ---- social ----
import { friendsScreen, addFriendScreen, friendProfileScreen, tournamentsScreen, tournamentCreateScreen, tournamentDetailScreen, tournamentRunScreen, leaderboardScreen } from './screens-social.js';
// ---- learning & profile ----
import { practiceScreen, chapterScreen, bossListScreen, gb15Screen, gb15VariantScreen, mistakesScreen, aiHelperScreen, achievementsScreen, statsScreen, avatarScreen, profileScreen } from './screens-learn.js';

route('splash', splashScreen);
route('onboarding', onboardingScreen);
route('home', homeScreen);
route('play-hub', playHubScreen);
route('bot-setup', botSetupScreen);
route('offline-hub', offlineHubScreen);
route('lobby', lobbyScreen);
route('room-create', roomCreateScreen);
route('room-join', roomJoinScreen);
route('waiting-room', waitingRoomScreen);
route('matchmaking', matchmakingScreen);
route('settings', settingsScreen);
route('notifications', notificationsScreen);
route('daily-challenge', dailyChallengeScreen);
route('duel', duelScreen);
route('solo', soloScreen);
route('boss', bossScreen);
route('boss-list', bossListScreen);
route('results', resultsScreen);
route('friends', friendsScreen);
route('add-friend', addFriendScreen);
route('friend-profile', friendProfileScreen);
route('tournaments', tournamentsScreen);
route('tournament-create', tournamentCreateScreen);
route('tournament-detail', tournamentDetailScreen);
route('tournament-run', tournamentRunScreen);
route('leaderboard', leaderboardScreen);
route('practice', practiceScreen);
route('chapter', chapterScreen);
route('gb15', gb15Screen);
route('gb15-variant', gb15VariantScreen);
route('mistakes', mistakesScreen);
route('ai-helper', aiHelperScreen);
route('achievements', achievementsScreen);
route('stats', statsScreen);
route('avatar', avatarScreen);
route('profile', profileScreen);

// ---- global event wiring ----
on('net:status', ({ online }) => {
  window.__maOnline = online;
  const banner = document.querySelector('.conn-banner');
  if (banner) {
    banner.className = 'conn-banner ' + (online ? 'on' : 'off');
    banner.textContent = online ? 'اتصال برقرار است — بازی آنلاین فعال' : 'حالت آفلاین — پیشرفت شما ذخیره می‌شود';
  }
  if (online) autoSync();
});

on('achievement:unlocked', ({ meta }) => {
  sfx.achievement();
  confetti({ count: 50, duration: 1600 });
  const s = S();
  s.notifications.unshift({ id: 'a' + Date.now(), kind: 'achievement', text: 'دستاورد جدید: ' + meta?.name, ts: Date.now(), read: false });
  save();
  document.getElementById('app').append(modal({
    title: 'دستاورد باز شد!',
    body: el2('div', { class: 'center' },
      el2('div', { style: { fontSize: '48px' } }, '🏅'),
      el2('b', { text: meta?.name || '' }),
      el2('div', { class: 'tiny muted', text: meta?.desc || '' })),
    actions: [{ label: 'ایول!', cls: 'primary' }],
  }));
});

function el2(tag, attrs, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
  }
  for (const c of kids.flat()) if (c != null) node.append(c);
  return node;
}

on('srv:match:incoming', () => {
  toast('حریف پیدا شد! در حال آماده‌سازی مسابقه...', { icon: 'trophy' });
});

on('srv:match:found', (p) => {
  if (!p.matchId) return; // pending pre-notification
  const cur = window.__maScreen;
  if (cur === 'duel' || cur === 'waiting-room' || cur === 'matchmaking' || cur === 'results') return;
  sfx.matchStart();
  nav('duel', { online: true, matchId: p.matchId, opponent: p.opponent });
});

on('srv:friend:accepted', (p) => {
  sfx.friendJoin();
  toast(p.name + ' دوستت شد!');
});

on('srv:tournament:update', () => { /* screens refresh themselves */ });

// daily reminder chip (in-app only, non-intrusive)
(function dailyCheck() {
  const s = S();
  const today = new Date().toISOString().slice(0, 10);
  if (s.onboarded && s.daily.date !== today && !s.daily.remindedAt) {
    s.daily.remindedAt = today;
    save();
    setTimeout(() => {
      if (S().daily.date !== today) {
        toast('چالش روزانه منتظرت است! +' + fa(60) + ' XP', { icon: 'clock', dur: 4000 });
      }
    }, 8000);
  }
})();

// ---- Android WebView bridges ----
// network state pushed by the native shell
window.__maNetwork = (online) => {
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
};
// hardware back: navigate back in-app, double-press to exit
let lastBack = 0;
window.__maBack = () => {
  const stackOrder = ['duel', 'solo', 'boss', 'matchmaking', 'waiting-room', 'gb15', 'gb15-variant',
    'add-friend', 'friend-profile', 'tournament-create', 'tournament-detail', 'tournament-run',
    'chapter', 'bot-setup', 'offline-hub', 'lobby', 'room-create', 'room-join', 'avatar', 'stats',
    'achievements', 'leaderboard', 'mistakes', 'notifications', 'settings', 'results'];
  const cur = window.__maScreen;
  const homeScreens = ['home', 'play-hub', 'friends', 'tournaments', 'profile', 'practice', 'boss-list', 'daily-challenge'];
  if (cur && stackOrder.includes(cur)) {
    const parent = { chapter: 'practice', bot_setup: 'play-hub' }[cur] || 'home';
    nav(homeScreens.includes(parent) ? parent : 'home');
    return 'handled';
  }
  if (!homeScreens.includes(cur)) {
    nav('home');
    return 'handled';
  }
  const now = Date.now();
  if (now - lastBack < 2500) return 'exit';
  lastBack = now;
  import('./core.js').then(({ toast }) => toast('برای خروج دوباره دکمهٔ بازگشت را بزن'));
  return 'handled';
};

// first message: go splash
nav('splash');
