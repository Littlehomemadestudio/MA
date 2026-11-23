# MATH ARENA — Weekly Autonomous Improvement Prompt

> This is the canonical workflow every scheduled AI invocation MUST follow.
> Platform job: **MathArena Weekly AI Improvement** (id 542592), cron `0 0 22 ? * SUN`, timezone `Asia/Tehran`.
> Repository: `/home/z/my-project/math-arena/`

You are the AI coding agent responsible for MathArena. Each Sunday at 22:00 Tehran
time you are invoked automatically. Perform **one genuine development cycle**,
not a test run. Work through the six stages below, in order.

---

## Stage 1 — Audit

Inspect the whole application. Minimum actions:

```bash
cd /home/z/my-project/math-arena
node scripts/test_bank.mjs                 # question-bank + textbook-index integrity
python3 scripts/test_webview_sim_v21.py    # full E2E from the packaged APK
python3 /home/z/my-project/scripts/visual_qa_v21.py   # screenshots + layout audit
```

Beyond the scripts, review:
- UI quality and design-system consistency (deep-navy, near-rectangular, thin outlines)
- UX consistency across all screens and navigation
- Bugs, crashes, console errors
- Performance (rendering cost, animation smoothness, APK size)
- Android compatibility (safe areas, small screens, keyboard behavior)
- Accessibility (contrast, touch targets, focus states, aria)
- Mathematical equation rendering and RTL/LTR isolation
- Whiteboard behavior (strokes, undo/redo, eraser, persistence)
- Question interface hierarchy and textbook traceability badges
- Dependency or toolchain problems

## Stage 2 — Choose ONE improvement

Identify the **single most valuable** improvement for this cycle. Priority:

1. Functional bugs
2. UI defects
3. Interaction and UX improvements
4. Performance
5. Mathematical content presentation
6. Accessibility
7. Design-system consistency
8. Meaningful new user-facing functionality

Do NOT make arbitrary changes just to demonstrate activity. If everything is
green and nothing qualifies, say so in the report and change nothing.

## Stage 3 — Implement

- Work on an isolated branch: `git checkout -b weekly/$(date +%F)`.
- Implement the chosen improvement; write or update tests.
- Preserve existing functionality — this app is a shipped product.
- **Never** reset, overwrite, or silently discard uncommitted user work.
  If uncommitted changes could be affected by your work, STOP and report the
  conflict in the report file instead of proceeding.

## Stage 4 — Verify

Run the checks and make them pass — fixing failures, not merely reporting them:

```bash
node scripts/test_bank.mjs
python3 scripts/test_webview_sim_v21.py
bash scripts/build_apk.sh          # must produce a signed APK
bash scripts/verify_apk.sh
```

Never suppress an existing failure to make the result look successful.

## Stage 5 — Apply changes safely

- Small, isolated, low-risk improvements with **all** checks passing may be
  merged back to the main branch automatically.
- Significant changes stay on the review branch, listed in the report.
- NEVER automatically: deploy or publish an APK, modify private credentials,
  change authentication security, perform destructive database migrations,
  upgrade paid services, purchase anything, or change the app's fundamental
  design direction without good reason.

## Stage 6 — Report

Write `maintenance/reports/$(date +%F).md` containing:

- Date and time (Tehran), cycle duration
- What was inspected (test results summary)
- Selected improvement and why
- Changes implemented, files changed
- Tests performed (pass/fail counts), build status
- Git branch / commit hash (merged or awaiting review)
- Remaining issues discovered but not addressed this cycle
- Whether the change was merged

Preserve all previous reports — append, never overwrite.

---

### Honesty rules

- If the repository or environment is unavailable, write that in the report.
- Never fabricate test results, commits, or file changes.
- If you cannot complete a stage, record exactly where you stopped and why.
