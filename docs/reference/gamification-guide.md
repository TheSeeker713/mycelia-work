# Gamification guide

The source-of-truth explanation for the XP/leveling/rewards system —
what earns XP, how leveling works, badges vs. stickers, and the
no-punishment rule. Written once here, referenced (not re-derived) by
the in-app disclosure inside the Progress tab and by anyone building
the next piece of this system. See `docs/reference/
next-build-wave-plan.md`'s Section 2 for the original design
conversation and rationale; this doc is the plain-English result, kept
in sync with the actual code in `src/services/gamification.ts`.

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
| Reaching 7 / 30 / 100 / 365 active days | 50 / 150 / 300 / 1000 + a sticker | See "Streaks" below — each tier is one-time |
| Coming back after a gap | 15 + a random sticker | See "Welcome back" below |
| First-ever clock-in, note, todo completion, or project | 10 each + a sticker | One-time per action type |
| First-ever 4-hour day | 25 + a sticker | One-time, on top of the repeatable daily 4-hour bonus above |
| 10th / 50th note ever written | 15 / 30 + a sticker | Counted cumulatively off the XP log itself, no separate tally needed |
| 10th / 50th / 100th todo completed ever | 15 / 30 / 60 + a sticker | Same |
| 10th / 50th / 100th session (clock-in) ever | 15 / 30 / 60 + a sticker | Same |

The personal journal feature (a separate, not-yet-built thing from the
existing auto-generated work journal) will earn word-count-based XP
once it ships — see the plan doc's Section 2.2. Only manually-typed
words will count; anything accepted from an AI ghost-text suggestion
won't. Real curated art already exists for a "first journal entry"
sticker (`sticker_first_journal_entry`) — reserved, not yet reachable.

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
  a streak milestone, a first-time action, a count milestone, or
  coming back after time away. Project-finish and welcome-back
  stickers are repeatable — earned again every time they qualify.
  Everything else (streak tiers, first-time actions, count milestones,
  the first 4-hour day) is one-time, since the underlying counter it's
  based on only ever goes up.

Either way, unlocking one shows a short pop-up (about 4.5 seconds,
then fades) — never a modal you have to dismiss.

## Rotating art — never the same reward image twice

Every badge/sticker concept has a **pool** of real curated images, not
one fixed picture. When something's unlocked, the toast pop-up rolls a
random image from that concept's pool — the Progress tab's persistent
badge grid and sticker list show a stable representative image instead
(so your collection view doesn't visually shuffle on every render).
Concepts with only one curated image just always show that one; most
have several, and project-finished, welcome-back, and "first note"
in particular have real variety. This is deliberate, per Jeremy: real
replayability means never seeing the exact same reward image twice in
a row for a repeatable achievement.

Every single curated image file gets used somewhere — see
`src/services/gamificationAssets.ts`'s own tests, which fail if any
curated file is left unreferenced or accidentally duplicated across
two pools.

## Streaks

The "streak" is a count of **distinct calendar days with real
activity**, not a literal consecutive-day counter — and that's not an
approximation, the two are mathematically the same thing once you
accept the no-punishment rule below (a streak that never resets on a
gap behaves identically to a running count of active days). Every new
day you do something real, it goes up by one. A gap doesn't reset it —
it just doesn't grow on the days you weren't active. Milestone tiers:
7, 30, 100, and 365 days, each a one-time sticker + XP award.

## No punishment, ever

Nothing in this system ever takes XP away, drops a level, or shows a
negative state. Missing a day (or a week) just means no *new* rewards
accrue during the gap — nothing is lost, and the streak simply resumes
counting from where it left off once you're back.

**Welcome back:** after roughly 3+ days away, your next real action
(clocking in, adding a note, finishing a todo — anything) triggers its
own small reward: a flat XP bonus, a random "welcome back" sticker
(drawn from an 11-image pool), and a warm voice line — spoken once,
out loud, if self-voicing is on. This is re-earnable every time you
qualify for it again, not a one-time thing.

## Where this lives in code

- `src/services/gamification.ts` — the level curve, XP constants,
  badge/sticker catalogs (including the count-milestone and first-time
  achievement configs), and the welcome-back/streak helper functions.
  Pure functions and data only.
- `src/store/gamificationStore.ts` — the actual award logic
  (`recordClockIn`, `recordNote`, etc.), wired into the sessions/
  notes/todos/projects stores. `unlockStickerOnce()` is the shared
  one-time-unlock path for first-time and count-milestone stickers;
  `checkCountMilestones()` counts directly off the XP log rather than
  keeping a separate running tally.
- `src/data/repositories/gamificationRepository.ts` — the three
  tables: `gamification_stats` (one row), `xp_events` (every award,
  audit-log style — also what count milestones are counted from),
  `unlocked_achievements` (one-time badge/sticker unlocks only;
  repeatable stickers like project-finished and welcome-back aren't
  recorded here, just logged as xp_events).
- `src/components/compartments/ProgressCompartment.tsx` — the
  "Progress" tab: level, XP bar, badge grid, sticker list.
- `src/components/AchievementToast.tsx` — the pop-up, which rolls the
  random pool image once per toast (stable for that toast's lifetime,
  not re-rolled on re-render).
- `src/services/gamificationAssets.ts` — the real curated art (`src/
  assets/gamification/`, a bundled copy of Jeremy's staged files in
  `assets/gamification/`), as image pools keyed by badge level /
  sticker key.

Every curated concept from the art set is now a real, awardable
achievement except the personal-journal sticker (feature not built
yet — see above).
