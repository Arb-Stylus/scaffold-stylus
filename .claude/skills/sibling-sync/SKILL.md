---
name: sibling-sync
description: Phase 2 — verify (and, where automation is missing or broken, specify updates for) the sibling repos that receive changes from the main scaffold project: create-stylus, create-stylus-extensions, and the docs repo. Use when asked to propagate a release, check whether siblings are in sync, or gate phase 2. Must not run until phase 1 (update-check) has merged AND the phase 1.5 smoke test has passed.
---

# Sibling Sync — Phase 2

Verifies that changes merged to the main scaffold project have actually reached its three siblings —
`create-stylus`, `create-stylus-extensions`, and `scaffold-stylus-docs` — each of which receives updates by a
different mechanism, and specifies concrete updates where that mechanism is missing, broken, or stale.

## Rule

This skill **must not run** until:

1. Phase 1 (`update-check`) findings are merged and released, and
2. The phase 1.5 smoke test has passed on that release.

Running phase 2 against an unmerged or unverified base produces a report about work that isn't real yet. The
script's own **Gate** step re-checks readiness and aborts if phase 1 is not actually done — that gate is a
backstop, not a substitute for checking this rule first.

This skill is **read-only**: it never edits, commits, publishes, or upgrades anything in any repo. Its output
is a per-sibling verdict and, where needed, a concrete update spec. Applying anything from that spec is a
separate, delegated task.

## Run it

```
Workflow({ scriptPath: ".claude/skills/sibling-sync/phase2-siblings.mjs" })
```

The script resolves the main repo path itself via `git rev-parse --show-toplevel` and derives the GitHub org
from `git remote get-url origin` — it carries no absolute paths and works from any clone.

## MODE_DISCOVERY — check vs. update

Before verifying anything, each sibling agent must first decide, with evidence, whether working automation
exists for that sibling:

- ls the repo's `.github/workflows/` (or confirm `.github/` doesn't exist at all)
- for each relevant workflow: `gh run list --workflow <file> --limit 5 --json conclusion,createdAt`
- does its trigger still **resolve**? A workflow triggering on a branch that was deleted never fires again —
  check with `git ls-remote --heads origin <trigger-branch>`
- did it run **after** the main repo's most recent relevant merge, and did it **conclude success**?

A workflow file existing is not proof of working automation. Zero runs, a last run predating the merge that
matters, or a dead trigger all mean the automation is not doing the job.

That decides the **mode**, recorded per sibling:

- `mode = "check"` — working automation exists. The agent only verifies it actually ran and carried the right
  content; it does not re-specify work the automation already does.
- `mode = "update"` — no automation, or it's broken/dead/stale. The agent specifies the concrete update: exactly
  which files must change, to what, and why — specific enough to execute without re-deriving the analysis.

A sibling expected to be automated that turns out not to be is a **blocker finding** in its own right, separate
from whatever content is stale.

## What it checks — 3 parallel siblings

| Sibling | Delivery mechanism | Urgency |
|---|---|---|
| `create-stylus` | Automatic: merge to main rsyncs into `templates/base` and runs `npm publish` | Reaches users on next publish |
| `create-stylus-extensions` | Manual: each extension is a branch fetched as an overlay **at scaffold time**, no CI | Reaches users **immediately** — no publish step, no version to pin back to |
| `scaffold-stylus-docs` | Manual, no PR-level CI | Misleads users but doesn't break builds |

For `create-stylus`, verification checks propagation against real file diffs (not "looks synced"), confirms no
maintainer tooling leaked into the **published npm tarball** (the exclude list is a claim, the tarball is the
evidence), and checks version parity across the main repo, the sibling, and the npm dist-tags.

For `create-stylus-extensions`, verification enumerates every extension branch and checks whether its overlay
still applies cleanly to the updated base — a file an overlay replaces that the base has since restructured is
the classic silent break. `chainlink-data-feed` is intentionally frontend-only with a no-op deploy script; that
is not a bug.

For `scaffold-stylus-docs`, verification greps for version numbers and commands that no longer match the repo,
and distinguishes docs that are **wrong** (would mislead or break a user) from docs that are merely incomplete.

## Reading the output

The synthesis report ranks propagation failures first — a sibling where the main repo's changes never actually
arrived, even though phase 1 merged — then ranks remaining findings by how fast they reach users, not by
tidiness. Any leaked maintainer file in the published npm package is a blocker regardless of other severity.
Every sibling's `mode` is reported alongside its verdict; a sibling in `update` mode with no findings is a
contradiction the report should flag, not silently accept.

## After the run

1. Report the verdict per sibling, propagation failures first.
2. Report each sibling's mode (`check` / `update`) alongside its verdict.
3. For anything actionable, delegate the change or apply it as a separate task — this skill does not apply
   changes.
