---
name: demo-video
description: Use when asked to record a demo video proving scaffold-stylus works end to end — a terminal take of a real Arbitrum Sepolia deploy, and a browser take of a real MetaMask wallet connecting and sending a write transaction against that deploy. Triggers on requests to record a demo, produce a proof video, or show a real deploy + wallet flow on camera.
---

# demo-video

## Overview

Gian asked for a video demonstrating that scaffold-stylus actually works.
`smoke-test`'s Step 9 already proves a real Arbitrum Sepolia deploy, and
`.claude/skills/cdp-with-wallet` proves a real MetaMask wallet can be
driven end to end without a human clicking the extension popup. This
skill records both as two takes:

1. **Take 1 (terminal)** — wraps smoke-test Step 9 *exactly as it already
   exists* (9a–9e; 9f is deferred, see "Sequencing" below), recorded with
   `asciinema`.
2. **Take 2 (browser)** — drives a real MetaMask connect + write tx
   against the contract Take 1 just deployed, via `cdp-with-wallet`'s
   primitives, recorded with Chrome DevTools Protocol's own
   `Page.startScreencast`.

Zero npm dependencies, matching `.claude/skills/smoke-test/browser-e2e.mjs`
and `.claude/skills/cdp-with-wallet/*.mjs`.

## Files

```
.claude/skills/demo-video/
  SKILL.md    this file
  record.mjs  orchestrates take 1, take 2, and cleanup
  step9.sh    the ACTUAL smoke-test Step 9 procedure (9a-9e), invoked by
              record.mjs under `asciinema record` -- not a parallel/demo-
              only script. If this drifts from Step 9 as documented in
              smoke-test's own SKILL.md, that is a bug here, not an
              acceptable shortcut: the whole point of wrapping the real
              procedure is that the recording and the test cannot drift
              apart.
```

## Prerequisites

Everything `cdp-with-wallet` needs (run `node
.claude/skills/cdp-with-wallet/preflight.mjs` first — see its own SKILL.md
for the three-way exit code), plus:

```bash
brew install asciinema agg ffmpeg
```

Versions this was built and measured against: `asciinema` 3.2.1, `agg`
1.9.0, `ffmpeg` 8.1.2.

## Usage

```bash
node .claude/skills/demo-video/record.mjs all --branch=<branch-you-are-demoing>
node .claude/skills/demo-video/record.mjs take1 --branch=<branch>   # terminal only
node .claude/skills/demo-video/record.mjs take2 --branch=<branch>   # browser only (needs take1 to have run first)
node .claude/skills/demo-video/record.mjs cleanup                    # escape hatch after a crashed run
```

`--branch` (or `DEMO_VIDEO_BRANCH`) is **required** for `all`/`take1`/
`take2` — see "Why the base branch must be stated" below. `--pr=<number>`
lets the proof block (see "Why the proof block exists") post automatically
via `gh pr comment`; without it, the block is still generated and printed,
just not posted.

Artifacts land in `~/Desktop/stylus-demo-<YYYY-MM-DD>/` (override with
`DEMO_VIDEO_OUTDIR`), following the smoke-test screenshot precedent.
**Videos/GIFs/casts are never committed** — add ignore rules if a repo's
`.gitignore` doesn't already cover `~/Desktop`.

## Why the base branch must be stated

**This is the one lesson from building this skill that must not recur.**
The first full recording cycle on 2026-07-22 was run against `main`
without ever stating that on purpose — it happened to be the branch
checked out at the time, not a deliberate choice. `main` still had a
removed-elsewhere Uniswap price-fetch feature throwing errors, none of the
ENS-gating or block-explorer-pagination fixes that had already landed on
`release/phase-1`, and (unrelated but compounding) a real gas-fee bug on
the Debug page that made the write transaction fail outright. The
recording was fully valid — it played, the tx hash was real — and would
have shown Gian exactly the wrong code while asking him to approve
different code. **A demo recorded from the wrong branch looks completely
valid and is silently worthless; there is no way to tell from the video
itself that it proves the wrong thing.**

So `record.mjs`'s very first step (`requireStatedBranch()`) refuses to
record at all until the target branch is stated explicitly — via
`--branch=<name>` or `DEMO_VIDEO_BRANCH` — and that value is checked
against what's actually checked out (`git rev-parse --abbrev-ref HEAD`),
catching the second-order mistake of stating one branch while sitting on
another. This is a preflight gate, not a comment: it `process.exit(3)`s
with the actual checked-out branch and the exact flag to re-run with, the
same SKIP-not-crash contract as smoke-test's own gates. The branch and
commit SHA are then stamped into both artifacts (asciinema's `--title`,
the mp4's `-metadata comment`) so the artifact itself identifies its
source — a reviewer doesn't have to trust a claim made elsewhere about
what a video shows.

## Why the proof block exists

A video on its own proves nothing to a reviewer — it's a recording of
pixels. Nobody reviewing a PR can independently verify a claim from
watching one. The tx hashes, the arbiscan links, and the raw on-chain
read-back (a fresh `cast call`, not just the dapp's own UI reading its own
write back to itself) **are** the actual proof: a reviewer can paste a
hash into arbiscan or run the same `cast call` and get the same answer
this skill got. That evidence is only useful if it travels **with** the
PR automatically — a human copying hashes around after the fact is
exactly the step that gets skipped under time pressure and forgotten.

So after a successful run, `record.mjs` emits a ready-to-paste markdown
block (contract address, every tx hash with its
`https://sepolia.arbiscan.io/tx/<hash>` link, the independent on-chain
read-back, the video's duration vs. the run's wall-clock duration, and the
branch + commit it was recorded from) and posts it to the PR itself via
`gh pr comment` when one is found for the current branch (or given
explicitly with `--pr=<number>`) — not just printing it for a human to
relay.

**Known limitation, stated plainly rather than worked around: `gh` cannot
attach video or image files to a PR body or comment — only text (links,
hashes) travels this way.** The actual `.mp4`/`.gif` files still need a
human to drag them into the GitHub web UI (a PR comment's edit box, or a
release asset). The proof block carries everything *except* the media
itself, and says so in its own last line.

## Sequencing — read before changing the flow

Take 2 needs `packages/nextjs/contracts/deployedContracts.ts` to contain
the Sepolia entry Take 1 just deployed, or the app has no contract to
show. But smoke-test Step 9f restores that file as cleanup. So the order
is: **Take 1 (9a–9e only) → Take 2 → cleanup (9f-equivalent, plus
restoring `scaffold.config.ts` and any newly-dirtied `next-env.d.ts`)**.
`cleanupAll()` runs in a `finally` in `main()`'s `all` mode, so it fires
regardless of outcome. Running `take1`/`take2` standalone skips this
cleanup on purpose (so you can inspect state between them by hand); use
`cleanup` as the explicit escape hatch afterward.

`packages/nextjs/next-env.d.ts` may already be dirty before this skill
ever runs (Next.js rewrites it on its own) — its baseline dirtiness is
captured before Take 1/Take 2 run and only restored if it was clean at
that baseline, so a developer's own pre-existing change there is never
silently discarded.

## Why CDP screencast, not macOS `screencapture -v`

The original design used macOS `screencapture -v` for Take 2. That
requires the Screen Recording TCC permission for whichever app hosts the
invoking process. Mid-build, that permission was granted but had **not**
taken effect — macOS only applies a TCC grant when the process restarts,
and the host app was not restarted — yet a probe recording still
succeeded (ffprobe-verified real duration/dimensions/frame-count; visually
confirmed non-black content). Given that ambiguity and the cost of
restarting a session with many other things running in it, the call was
made to switch to CDP's own `Page.startScreencast` instead: it captures
frames from inside Chrome, needs no OS permission at all, works headless,
and works in CI (a physical screen recording never could). This is the
approach actually implemented — `record.mjs` never shells out to
`screencapture`.

One consequence: `cdp-with-wallet`'s `launchChrome()` can stay at its
default `headless: true` for this skill too — an earlier version of that
skill's own docs said recording needed `headless: false`; that guidance
predated this switch and has been corrected in `cdp-with-wallet/SKILL.md`
and `launch.mjs`.

## The frame-timing trap (measured, not assumed)

`Page.screencastFrame` does **not** fire at a fixed rate — only when the
page actually repaints — and each frame must be acknowledged via
`Page.screencastFrameAck` or the stream stalls. A first implementation
assembled frames into a video using ffmpeg's concat demuxer with a
per-frame `duration` computed from the gap to the next frame's timestamp,
floored at 50ms to avoid a zero-duration entry. **Measured result: a real
11.1-second run assembled into a 27-second video (2.4x too long).** Most
of the 456 captured frames arrived faster than 50ms apart (real UI
repaints during the connect/switch/write flow), so flooring every one of
those sub-50ms gaps to 50ms compounded across hundreds of frames into a
video whose timing had nothing to do with what actually happened — a
valid file that plays, silently wrong. The floor was lowered to 1ms (just
enough for ffmpeg's concat demuxer to accept a positive duration, not
"watchable per frame"); re-verified: a 10.84s video against a 10.77s
wall-clock run, and later a 12.08s video against a 12.02s run. **Always
report both numbers — video duration and the run's own wall-clock
duration — side by side; a value that plays with no comparison is not
evidence they match.**

If a run fails after the screencast has started, whatever frames were
captured are still assembled and saved as a partial video (with the error
printed alongside) rather than discarded — a partial recording someone
can point at and say "it stops here, that's the bug" beats a clean
failure with zero artifact.

## Measured — the four items the design called out up front

1. **`agg` 1.9.0 vs asciicast-v3.** Measured **works directly** — `agg`
   read a real asciicast-v3 recording (the default format for asciinema
   3.x) with no conversion needed. `--output-format asciicast-v2` is not
   required.
2. **asciinema 3.x CLI.** Confirmed via `asciinema record --help` on this
   machine: the subcommand is `asciinema record <FILE>` (not `rec`), and
   `--command`, `--title`, `--output-format`, `--return`, and `--overwrite`
   all behave as documented. `--return` is what lets `record.mjs` read
   Step 9's real exit code without a separate tee/pipefail dance.
3. **`screencapture -v` and the Screen Recording permission.** Measured
   as described above under "Why CDP screencast, not screencapture" —
   this became moot once the design switched away from `screencapture`
   entirely.
4. **Recording a window vs. the whole screen.** Also moot for the same
   reason — CDP screencast captures a specific page's rendered content
   directly, not a physical display region at all.

## The staleness trap — "the artifact exists" is not "the artifact is from THIS run"

`packages/stylus/deployments/421614_latest.json` and
`packages/nextjs/contracts/deployedContracts.ts` both persist across runs
by design (smoke-test's own Step 8 only deletes them on PASS). This means
a deploy command that exits 0 without actually rewriting one of them would
otherwise let a later check silently re-verify a **previous** run's
deployment and report PASS — the same failure shape as reading a
non-empty extension-settings directory as "vault initialised", or a
present Keychain entry as "password correct" (both traps `cdp-with-wallet`
hit and fixed the same day this skill was built). Two independent
cross-checks guard against it here:

- `step9.sh` captures `yarn deploy`'s own stdout and cross-checks the
  address/tx hash it prints against what's in
  `deployments/421614_latest.json` — mismatch or unparseable stdout is
  **FAIL**, not PASS.
- `take1()` in `record.mjs` separately cross-checks that
  `deployedContracts.ts` — a different file, written by a different step
  of the same `yarn deploy` invocation — actually contains this run's
  deployed address before calling Take 1 PASS, since Take 2 renders from
  that file specifically.

(The equivalent gap in `smoke-test` itself — Step 4's local-devnode deploy,
and Step 9d/9e's Sepolia deploy read-back — was reported to the captain
separately; this skill's own artifacts are what's fixed here.)
