# MATH ARENA — Test Report (v2.1.0)

All results below were **actually executed** on 2026-11-22 in this environment.
Every failing check found during the cycle was fixed and the suite re-run to green.

## 1. Question bank & textbook index — `node scripts/test_bank.mjs`

**19/19 PASS** (732 questions)

| Check | Result |
| --- | --- |
| bank size / unique ids | 732, all unique |
| 3–4 options per question, correctIndex in range | PASS |
| difficulty 1–4, tier mirrors difficulty | PASS |
| family set (8 families) + per-family counts | PASS |
| every curriculum skill covered | PASS (38/38) |
| sourcePages within printed 1–170 | PASS |
| question HTML restricted to safe tags (bdi/span/sup/sub/table/…) | PASS |
| structural-fingerprint duplicates ≤ 3 per skill (anti-memorization) | PASS |
| book index offset = 5, contiguous chapter pdf ranges | PASS |
| every question's cited page maps inside its chapter's pdf range | PASS |

Bugs found & fixed by this suite: chapter pdf ranges in `book_index` were wrong
(ch1 dropped its final lesson; several chapter ends off by 2–9 pages). Verified
against the actual textbook PDF, corrected, suite re-run to green.

## 2. WebView simulation E2E — `python3 scripts/test_webview_sim_v21.py`

**22/22 PASS** — runs against the **extracted final APK** (same file:// context
as the Android WebView), with the native bridges (`__maHaptic`, `__maNetwork`,
`__maBack`) mocked exactly as `MainActivity` provides them.

Covers: boot from file://, bank/book-index globals, haptic bridge installation,
question render, source badge, **book viewer opens at the exact cited page
(printed + 5 offset verified numerically)**, framed page + dark matte, close
returns to the same question, whiteboard toolbar, default grid, drawing
(pixel-count assertion), undo (pixel-count assertion), **stroke persistence
across collapse/reopen**, semantic haptics on answer (observed
`['select','error']`), correct/wrong option marking, auto-advance, hardware
back contract, state persistence across app restart, no horizontal overflow at
360px, zero page errors.

## 3. Visual QA — `python3 /home/z/my-project/scripts/visual_qa_v21.py`

**36 screenshots** (18 screens × 2 viewports: 390×844 and 360×700) captured to
`release/qa-v2.1/`, with a programmatic layout audit on every screen:
no horizontal overflow, no sub-30px touch targets, zero console/page errors
(only the expected offline fetch fallbacks).

## 4. VLM design review (before/after)

- **Before** (v2.0.0 screenshots, 6 screens): audit confirmed cartoonish
  elements — glowing neon hexagon, candy pill chips, cartoon mode icons with
  white blobs and ink strokes, toy whiteboard dots, raw white book page,
  iOS-style settings controls, cluttered result celebration.
- **After** (v2.1.0 screenshots, 6 screens + toolbar crop): verdict — home
  "mostly engineered… reads like a dashboard, not a kids' app", question
  screen "the strongest screen… disciplined", whiteboard "sophisticated — a
  real drawing surface". Defects the review still found (clipped home footer,
  option-border contrast, swatch outlines, book-page dead margins, lock-veil
  structure, whiteboard grid default) were **all fixed and re-verified**
  (close-button text re-checked character-by-character: `بستن` correct).

## 5. Build & package

| Step | Result |
| --- | --- |
| `bash scripts/build_apk.sh` | PASS — `release/MathArena-v2.1.0.apk`, 12 MB |
| `bash scripts/verify_apk.sh` | PASS — v2 signature scheme, cert CN=MathArena, versionCode 3, minSdk 24 / targetSdk 34, label «میدان ریاضی», 176 book pages inside, zip integrity OK |
| sha256 | `cc2b746e8b7fd6c5…` (full value in `maintenance/reports/2026-11-22.md`) |

## 6. Maintenance/scheduler verification

| Step | Result |
| --- | --- |
| platform cron job created (id 542592) | `0 0 22 ? * SUN`, `tz: Asia/Tehran`, status enabled |
| scheduler-reported next run | **2026-11-22T22:00:00+03:30** (independently recomputed: matches) |
| `run-weekly-improvement.sh --dry-run` | exit 0, correct plan, no changes made |
| `run-weekly-improvement.sh --audit` | exit 0 — bank 19/19 + webview E2E 22/22 re-executed inside the wrapper |
| locking | lock file honored; stale-lock cleanup path implemented |

## 7. What is NOT tested here (honest limits)

- No physical Android device / emulator run — headless Chromium is the same
  engine family as WebView and the APK boots from its extracted assets, but a
  first install on real hardware is still recommended.
- Haptic patterns execute through the real `Vibrator` only on hardware; in
  simulation the bridge call sequence is asserted instead.
- Online multiplayer paths (server) are out of scope for this cycle and were
  not exercised.
