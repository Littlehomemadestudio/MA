# MATH ARENA — Weekly Autonomous AI Improvement

The app keeps evolving after release: a scheduled job invokes the actual AI
coding agent every **Sunday at 22:00 Asia/Tehran** to audit, improve, verify,
and report — following `WEEKLY_IMPROVEMENT_PROMPT.md`.

## Where the schedule lives (two independent layers)

### 1. Platform scheduler (this environment) — ACTIVE

- Job name: **MathArena Weekly AI Improvement** (job id `542592`)
- Schedule: cron `0 0 22 ? * SUN` (6-field, seconds first) with `tz: Asia/Tehran`
- Payload: an `agentTurn` — the message instructs the AI agent to execute
  `WEEKLY_IMPROVEMENT_PROMPT.md` against `/home/z/my-project/math-arena/`.
- Verified next run (from the scheduler itself): **2026-11-22T22:00:00+03:30**
- It persists beyond any terminal session; no local crontab is involved.

Inspect / pause / remove (ask the assistant to run these, or use the cron API):

| Action | How |
| --- | --- |
| Inspect | `cron get 542592` — shows schedule, tz, next run, status |
| List all jobs | `cron list` |
| Pause | delete the job (`cron delete 542592`) and re-create it later with the same schedule |
| Remove | `cron delete 542592` |
| Run now | ask the assistant to perform one manual cycle: “run the MathArena weekly improvement cycle now” |
| Dry-run | `./maintenance/run-weekly-improvement.sh --dry-run` |

### 2. Self-hosted crontab (your own machine) — OPT-IN

For a machine where you run the repo yourself and have an agent CLI installed
(`claude`, `zai`, `codex`, …):

```bash
# edit the path inside first
crontab maintenance/crontab.example     # CRON_TZ=Asia/Tehran, Sun 22:00
crontab -l                              # verify
```

The wrapper `maintenance/run-weekly-improvement.sh` provides:

- `flock`-style locking (no overlapping cycles; stale locks are cleaned)
- full logging to `maintenance/reports/scheduler.log`
- `--dry-run` (no changes), `--audit` (Stage 1 tests only)
- exit codes: `0` ok · `1` already running · `2` repo problem · `3` no agent CLI
- catch-up: if the machine was off at the scheduled time, run
  `./run-weekly-improvement.sh` manually; the cycle is idempotent per date
  (report file is per-day).

## What each cycle does

Audit → choose ONE improvement (bugs first, never arbitrary churn) →
implement on branch `weekly/YYYY-MM-DD` → run all tests + build APK →
merge only small low-risk changes → write `maintenance/reports/YYYY-MM-DD.md`.

Hard prohibitions (enforced by the prompt): no automatic APK publishing, no
credential/auth changes, no destructive migrations, no purchases, no design-
direction flips, no discarding uncommitted user work.

## Reports

Every cycle appends `maintenance/reports/<date>.md` (never overwrites).
`scheduler.log` holds the wrapper-level execution log.
