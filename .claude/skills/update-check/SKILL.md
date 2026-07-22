---
name: update-check
description: Phase 1 — audit the MAIN scaffold project for anything needing an update across four axes: Rust/Stylus toolchain, Next.js frontend deps, security advisories, and UI libraries + upstream scaffold-eth-2 parity. Use when asked "does anything need updating?", "are we behind scaffold-eth?", "any security issues?", "does the UI need updating?", before a release, or when resuming after time away. Read-only; produces a ranked plan, changes nothing. Phase 2 (siblings) is a separate skill and must not run until phase 1 is green.
---

# Update Check — Phase 1 (main project)

Covers four axes, not just dependencies: **Rust/Stylus**, **frontend deps**, **security**, and
**UI + upstream scaffold-eth-2 parity**.

Audits **this repo only**. Siblings are phase 2 and are explicitly out of scope — do not touch
`create-stylus`, `create-stylus-extensions`, or the docs repo here.

## Rule

This skill is **read-only**. It never edits, commits, upgrades, or regenerates a lockfile. Its output is a
ranked plan. Applying anything from that plan is a separate, delegated task.

## Run it

```
Workflow({ scriptPath: ".claude/skills/update-check/phase1-main.mjs" })
```

The script resolves the repo root itself via `git rev-parse --show-toplevel` — it carries no absolute paths and
works from any clone.

## What it checks — 4 parallel dimensions

| Dimension | Covers |
|---|---|
| `rust-stylus` | `stylus-sdk`, `openzeppelin-stylus`, `alloy-primitives`, `alloy-sol-types`, `cargo-stylus`, `rust-toolchain.toml` |
| `frontend-deps` | `next`, `react`, `viem`, `wagmi`, `rainbowkit`, `typescript` and other core runtime deps |
| `security` | Dependabot alerts, `npm audit`, `cargo audit`, CVEs against the pinned versions |
| `ui-se2-parity` | tailwind/daisyui majors, in-flight dependency branches, and upstream scaffold-eth-2 divergence |

## Constraints the script enforces

These are injected into every agent prompt. A recommendation that violates one is **wrong**, not a finding.

- `rust-toolchain.toml` pins **1.89.0**. Every `cargo-stylus` from **0.10.3** up needs **rustc ≥ 1.91.0**, so
  bumping the CLI *forces* a toolchain migration. Treat it as coupled work, never a standalone bump.
- **Never** run `cargo generate-lockfile`. `parity-scale-codec` is pinned at 3.7.5; the CI gate is
  `cargo metadata --locked`.
- `cargo build` on the **host** target fails on the openzeppelin-stylus 0.3.0 / stylus-sdk 0.9.0 VM mismatch.
  Expected and pre-existing — `cargo stylus check` and wasm pass. Not a bug.
- A different rustc changes wasm codegen, which changes **contract size**. Contracts over 24KB become
  multi-fragment and need ArbOS 60 to activate, so size is load-bearing.
- Merging to `main` **auto-publishes `create-stylus` to npm**. Anything landed ships to users immediately.
- **Never infer a PR's or branch's content from its name.** A branch called `chore/cargo-stylus-0.10.8` may not
  actually bump anything to 0.10.8 — read the real diff (`git diff origin/main...<branch>` / `gh pr diff`) and
  quote what's actually there. A claim about PR/branch contents not backed by a diff the agent actually read is
  a guess, not a finding. (This is the exact failure that produced a false "split PR #81, drop the 0.10.8 half"
  recommendation on 2026-07-21 — the agent read the branch name, not the diff.)
- **A version gap is not a finding — the changelog is.** Reporting "current X, latest Y" is an observation, not
  a finding. For any gap, read the release notes for every intervening version, not just the newest, and state
  what actually changed and whether it affects this project. Bare version numbers with no changelog read is a
  failed audit, not a complete one.

### Verified baseline

The constraint block also carries a **verified baseline**, dated **2026-07-21**, of facts that were confirmed
true on that run — OZ-stylus 0.3.0 still latest with no upstream VM-mismatch fix, the tailwind/daisyui majors
already landed in PR #67, wagmi 3.x still blocked, and the one Stylus contract's compressed size (20,756 bytes
against a 24,576 threshold). Agents are told to diff against these numbers instead of re-deriving them each run.
**Whenever a run re-confirms or invalidates an entry, update the baseline block in `phase1-main.mjs` with a new
verification date** — a stale, undated baseline is worse than no baseline.

## Reading the output

Findings are ranked security-first, then grouped:

- **INDEPENDENT** — can ship on its own.
- **COUPLED** — forces another change (e.g. cargo-stylus → rust-toolchain). Needs its own planned task with
  re-verification of contract sizes, OZ compat, and an extension deploy. Never a drive-by bump.

The report also lists what was checked and found **current**, so cleared ground is distinguishable from
skipped ground.

## Security results — three states, never conflated

The script forces each security result into one of these. Read them carefully:

1. scanner **ran** and found nothing
2. scanner **did not run** — not installed, disabled, or 403
3. vulnerability found but **not exploitable** in this codebase's usage

State 2 is not "clean". A green report from a scanner that never ran proves nothing — treat it as an unchecked
dimension and say so.

## Tool traps

Injected into the `security` dimension prompt specifically — each has produced a wrong result on a real run, so
the consequence is stated alongside the instruction rather than left implicit:

- `gh api ... --paginate` is **mandatory** on the Dependabot alerts endpoint. Measured on a sibling repo: 25
  alerts without `--paginate` vs 29 with it. Omitting it silently **under-reports**, and the missing alerts look
  like a clean result instead of a gap.
- `gh release list` sorts by **date**, not "latest stable" — a pre-release published after the last stable tag
  sorts above it. Use `--exclude-pre-releases`, or a pre-release gets reported as the current latest version.
- `npm view <pkg> version` returns the latest **dist-tag**, which can lag the newest published version. Don't
  treat it as ground truth for "is there something newer".
- A wrong GitHub org/repo in a query fails in a way that is **indistinguishable from "no alerts found"**. Verify
  the org/repo resolved from `git remote get-url origin` before trusting a clean result.
- The GitHub dependency graph can be **unpopulated** while Dependabot alerts are enabled. When that happens, the
  alerts endpoint returns `[]` and `GET /repos/{owner}/{repo}/dependency-graph/sbom` 404s. An empty alerts
  response in that state is an artifact of an unpopulated graph, not a clean result — confirm the SBOM endpoint
  returns 200 before trusting an empty alerts list. Proof this matters: discovered on the 2026-07-21 run, this
  repo's tree provably contains `postcss` 8.4.31 (GHSA-qx2v-qp2m-jg93), which Dependabot should have flagged and
  did not.

## End-of-run disclosure — what did NOT run

The synthesis step's output schema has a mandatory `notRunOrUnchecked` field, separate from `findings`. It must
list every scanner, tool, or data source that did not execute or could not be verified that run — e.g.
"cargo-audit not installed", "GitHub dependency graph unpopulated". This is a first-class section of the report,
not something folded into a finding or left as an implicit omission; it must be impossible to overlook.

## After the run

1. Report the verdict, security findings first.
2. Report what did **not** run (the `notRunOrUnchecked` section) as clearly as what did.
3. For anything actionable, delegate the change or apply it as a separate task — this skill does not apply changes.
4. Confirm the main project is green **before** moving to phase 2 (siblings).
