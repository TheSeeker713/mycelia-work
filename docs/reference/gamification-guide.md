# Gamification guide

The source-of-truth explanation for the XP/leveling/rewards system —
what earns XP, how leveling works, badges vs. stickers, and the
no-punishment rule. Written once here, referenced (not re-derived) by
the in-app Help entry (`GamificationHelpPanel.tsx`) and by anyone
building the next piece of this system. See
`docs/reference/next-build-wave-plan.md`'s Section 2 for the original
design conversation and rationale; this doc is the plain-English
result, kept in sync with the actual code in `src/services/
gamification.ts`.

No hidden-unlock gate of any kind here — this is an ordinary, always
visible feature (unlike the removed 18+ system). Everything below
lives in the "Progress" tab and fires from actions you're already
taking.

## What earns XP

| Action | XP | Notes |
|---|---|---|
| Clock in | 5 | Starting a session |
| Clocked time | 10/hr | Whole hours only, calculated from elapsed active time at clock-out |
| 4 hours clocked, same day | +20 | Summed across every session clocked that day, not just one |
| 8 hours clocked, same day | +50 | Same day-level summing |
| Writing a note | 2 | The existing Notes feature |
| Creating a project | 5 | Setting one up |
| Finishing a project | 40 + a sticker | Marking it done — not setup |
| Completing a todo | 5 | Completion only — creating a todo earns nothing |
| First real action of the day | 5 | Any day with at least one clock-in, todo, note, etc. |
| Reaching 7 active days | 50 + a sticker | See "Streaks" below — one-time |
| Reaching 30 active days | 150 + a sticker | Same, one-time |
| Coming back after a gap | 15 + a random sticker | See "Welcome back" below |

The personal journal feature (a separate, not-yet-built thing from the
existing auto-generated work journal) will earn word-count-based XP
once it ships — see the plan doc's Section 2.2. Only manually-typed
words will count; anything accepted from an AI ghost-text suggestion
won't.

## Levels

Capped at **level 111**. Cumulative XP needed for level *N* is
`100 * (N-1)^1.6`, rounded — a tempered curve rather than literal
doubling, so it stays climbable all the way to the cap instead of
becoming numerically absurd. Level 2 costs exactly 100 XP; level 111
costs 184,599 XP. Each level takes a bit more than the last.

Reaching level 111 unlocks "something not designed yet" — deliberately
left open. If that ever becomes a real feature, it'll check
`hasFeaturesUnlockedAtLevel111()` rather than needing new plumbing.

## Badges vs. stickers

- **Badges** are earned by leveling up. Cadence: level 1, 2, 5, then
  every 5 levels from 10 through 110, plus a special badge at the
  111 cap — 25 total. Each badge is a one-time unlock; levels only
  move forward, so there's no way to lose one.
- **Stickers** are earned by finishing things: a project completion,
  a streak milestone, or coming back after time away. Project-finish
  and welcome-back stickers can be earned any number of times, once
  per qualifying event. Streak-milestone stickers (7-day, 30-day) are
  one-time, since the streak counter itself only ever goes up.

Either way, unlocking one shows a short pop-up (about 4.5 seconds,
then fades) — never a modal you have to dismiss.

## Streaks

The "streak" is a count of **distinct calendar days with real
activity**, not a literal consecutive-day counter — and that's not an
approximation, the two are mathematically the same thing once you
accept the no-punishment rule below (a streak that never resets on a
gap behaves identically to a running count of active days). Every new
day you do something real, it goes up by one. A gap doesn't reset it —
it just doesn't grow on the days you weren't active.

## No punishment, ever

Nothing in this system ever takes XP away, drops a level, or shows a
negative state. Missing a day (or a week) just means no *new* rewards
accrue during the gap — nothing is lost, and the streak simply resumes
counting from where it left off once you're back.

**Welcome back:** after roughly 3+ days away, your next real action
(clocking in, adding a note, finishing a todo — anything) triggers its
own small reward: a flat XP bonus, one of ten distinct "welcome back"
stickers chosen at random, and a warm voice line — spoken once, out
loud, if self-voicing is on. This is re-earnable every time you
qualify for it again, not a one-time thing.

## Where this lives in code

- `src/services/gamification.ts` — the level curve, XP constants,
  badge/sticker catalogs, and the welcome-back/streak helper
  functions. Pure functions and data only.
- `src/store/gamificationStore.ts` — the actual award logic
  (`recordClockIn`, `recordNote`, etc.), wired into the sessions/
  notes/todos/projects stores.
- `src/data/repositories/gamificationRepository.ts` — the three
  tables: `gamification_stats` (one row), `xp_events` (every award,
  audit-log style), `unlocked_achievements` (one-time badge/streak-
  sticker unlocks only).
- `src/components/compartments/ProgressCompartment.tsx` — the
  "Progress" tab: level, XP bar, badge grid, sticker list.
- `src/components/AchievementToast.tsx` — the pop-up.
- `src/services/gamificationAssets.ts` — the real curated art (`src/
  assets/gamification/`, a bundled copy of Jeremy's staged files in
  `assets/gamification/`), mapped by level/sticker key. Any
  achievement without art wired here falls back to a plain chip.

**What's wired vs. what's still just art:** all 25 badges and the
project-finished/streak-7/streak-30/10 welcome-back stickers have real
images. The curated set (`assets/gamification/README.md`) has more
concepts than that — first-time todo/note/project/clock-in stickers,
10/50/100-count milestones, 100-day and 365-day streak tiers, a
four-hour-day badge — but this app doesn't award any of those yet, so
that art isn't referenced. Turning them into real achievements is a
real, scoped follow-up (new XP-source logic + tests), not just an
asset-wiring task.
