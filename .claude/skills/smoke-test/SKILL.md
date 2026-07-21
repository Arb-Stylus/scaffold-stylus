---
name: smoke-test
description: Use when validating scaffold-stylus after update-check (phase 1) upgrades are merged and before sibling-sync (phase 2) propagates them, to confirm the devnode -> deploy -> ABI export -> scaffold hooks -> tx signing -> read-back chain still works end to end. Triggers on requests to smoke-test, phase 1.5, or gate sibling-sync.
---

# Smoke Test (Phase 1.5)

## Overview

This is the Phase 1.5 gate between `update-check` (Phase 1, dependency
audit/upgrade) and `sibling-sync` (Phase 2, propagation to `create-stylus`,
`create-stylus-extensions`, and `docs`). Phase 1 upgrades touch Rust/Node
toolchains and dependency versions that `cargo stylus check`, `yarn`, and CI
alone cannot fully validate — they don't prove a contract still *activates*
on the local devnode, that its ABI still reaches the frontend, or that a
burner-wallet transaction still round-trips. This skill runs that full
chain for real and reports a verdict that gates whether Phase 2 is allowed
to proceed.

**READ-ONLY CONTRACT:** This skill is STRICTLY READ-ONLY with respect to
committed repository source. It runs the stack, deploys throwaway
contracts, and drives a browser — it MUST NOT edit `.rs`, `.ts`, `.tsx`,
`.toml`, or any other tracked source file to make a failing step pass.
If a step fails, report it as failed; do not "fix" it by editing code.
The only tracked files this skill's own steps are permitted to touch are
build artifacts it must restore in Step 8 (`deployedContracts.ts`) — see
that step for the exact restore command.

## Ordering Contract

1. `update-check` (Phase 1) — audits and upgrades dependencies.
2. Phase 1 upgrade PR(s) are merged to `main`.
3. **`smoke-test` (Phase 1.5) — you are here.** Validates the merged
   upgrades against the real stack.
4. `sibling-sync` (Phase 2) — propagates the validated state to sibling
   repos. **Only runs if this skill's verdict is PASS.**

## Non-Negotiable Reporting Rule (tri-state)

Copy this rule verbatim in behavior from `update-check` and `sibling-sync`:
every step below reports **exactly one** of three states — never two,
never a blend:

- **(a) RAN and passed** — the command executed and its concrete assertion
  held.
- **(b) DID NOT RUN** — a tool was missing, a port was busy, an env var
  was absent, or the step timed out waiting on something external. **(b)
  is not a pass.** It means the step gives no evidence either way.
- **(c) RAN and failed** — the command executed and its assertion did not
  hold, or the command exited non-zero for a reason other than a missing
  prerequisite.

**Verdict:**
- **PASS** — every required step (1 through 7) is (a).
- **INCONCLUSIVE** — any step is (b). Fix the missing prerequisite and
  re-run; do not treat INCONCLUSIVE as "probably fine."
- **FAIL** — any step is (c).

Neither INCONCLUSIVE nor FAIL opens the Phase 2 (`sibling-sync`) gate.
Step 8 (teardown) always runs regardless of verdict and is not itself
part of the PASS/INCONCLUSIVE/FAIL calculation — but a teardown failure
must still be reported, since a leaked devnode poisons the next run.

## Step 0 — Preflight

```bash
./.claude/skills/smoke-test/preflight.sh
```

Checks (in order): `node`, `yarn`, `docker` binary + daemon reachability
(`docker info`), `cast` (Foundry), `cargo`, `cargo stylus`, the
`SMOKE_TEST_CONFIRM` env gate (see Step 1), ports 8547/3000 free, and that
no artifact from a prior unclean run is already sitting in the working
tree (`packages/nextjs/contracts/deployedContracts.ts`,
`packages/stylus/deployments`, `packages/stylus/contracts/erc20-example`).

- Exit 0 → proceed to Step 2.
- Exit 1 (missing tool) or 3 (port busy) or 4 (dirty tree from a leaked
  prior run) → **(b) DID NOT RUN** for every downstream step; stop here.
- Exit 2 (env gate closed) → see Step 1; **(b) DID NOT RUN** for the whole
  run.

## Step 1 — Env Gate

Explicit opt-in is required before this skill touches anything:

```bash
export SMOKE_TEST_CONFIRM=1
```

**Why a gate:** this skill binds host ports 8547 and 3000, runs a Docker
container, deploys real (if throwaway) contracts, and drives a live
browser session with a burner wallet. It must never fire as a silent side
effect of another skill or an automated loop.

- `SMOKE_TEST_CONFIRM` set → **(a)**, proceed.
- Unset → **(b) DID NOT RUN — env absent.** Tell the caller to set it and
  stop; do not assume consent.

## Step 2 — Start the devnode

```bash
yarn chain &
CHAIN_PID=$!
```

This runs `nitro-devnode/start-chain-with-cors.sh`, which `docker run
--name nitro-dev -p 8547:8547 ...`, waits for the RPC, calls
`becomeChainOwner()`, and (as of the ArbOS-60 fix) schedules the ArbOS 60
upgrade itself. Do not schedule it again here — Step 3 only *verifies* it
landed.

Assertion — poll until the RPC answers, capped at 90s:

```bash
timeout 90 bash -c \
  'until curl -s -X POST -H "Content-Type: application/json" \
     --data "{\"jsonrpc\":\"2.0\",\"method\":\"net_version\",\"params\":[],\"id\":1}" \
     http://127.0.0.1:8547 | grep -q result; do sleep 1; done'
```

- `docker` fails to pull/start the image (daemon issue, network issue) →
  **(b) DID NOT RUN — devnode failed to boot** (external/environmental,
  not a code regression).
- Image starts but the RPC never answers within 90s, or the container
  exits, or `becomeChainOwner()`/CREATE2-factory/Cache-Manager/
  StylusDeployer setup inside the script errors out → **(c) RAN and
  failed** (this is the stack itself misbehaving — a real regression
  candidate).
- RPC answers within the timeout → **(a)**.

## Step 3 — ArbOS Assertion (regression gate for the multi-fragment fix)

This directly re-checks the fix landed in `db5dfcf` / PR #80: the dev node
boots at ArbOS 59 and must be moved to ArbOS 60, or every >24KB
(multi-fragment) Stylus contract will revert on activation.

```bash
cast call --rpc-url http://127.0.0.1:8547 \
  0x0000000000000000000000000000000000000064 \
  "arbOSVersion()(uint64)"
```

Assertion: output must be **115** (55 + ArbOS 60). `114` means the chain
is stuck at ArbOS 59.

- `cast` errors (RPC unreachable) → **(b) DID NOT RUN** (Step 2 already
  should have caught this; treat as devnode instability).
- Output is `114` → **(c) RAN and failed — devnode stuck at ArbOS 59;
  multi-fragment deploys will revert.** This is a real regression: it
  means `nitro-devnode/start-chain-with-cors.sh`'s
  `scheduleArbOSUpgrade(60, 0)` call regressed or the pinned image
  (`NITRO_NODE_VERSION` in that script) was downgraded below v3.10.0.
- Output is `115` → **(a)**.

## Step 4 — Deploy the default contract (deploy -> ABI export -> scaffold hooks)

```bash
yarn deploy
```

This runs `cargo stylus deploy` against `packages/stylus/contracts/
your-contract`, then automatically runs `cargo stylus export-abi` and
writes the address/ABI into `packages/nextjs/contracts/
deployedContracts.ts` (chain id `412346`) — the file the Next.js scaffold
hooks (`useScaffoldReadContract`/`useScaffoldWriteContract`) read from.

Assertion — all three must hold:

```bash
test -f packages/stylus/deployments/412346_latest.json
grep -q '"your-contract"' packages/nextjs/contracts/deployedContracts.ts
grep -q '412346' packages/nextjs/contracts/deployedContracts.ts
```

- `yarn` itself missing, or `.env`/network resolution errors before any
  RPC call is attempted → **(b) DID NOT RUN**.
- `cargo stylus deploy` exits non-zero, or exits 0 but
  `deployedContracts.ts` doesn't contain the new entry (export-abi step
  silently failed) → **(c) RAN and failed**.
- All three checks pass → **(a)**.

## Step 5 — Deploy a >24KB (multi-fragment) contract

This is the end-to-end proof for Step 3's regression gate: an ArbOS
report of 115 is meaningless if a real multi-fragment contract still
reverts. Reuse the exact contract type PR #80 verified (25.1KB / 2
fragments) by scaffolding it fresh from `create-stylus` rather than hand-
authoring new Rust for this skill:

```bash
npx create-stylus@latest smoke-fixture -e erc-20 --skip-install --skip-git
cp -r smoke-fixture/packages/stylus/contracts/erc20-example \
  packages/stylus/contracts/erc20-example
rm -rf smoke-fixture
```

`packages/stylus/contracts/` is a Cargo workspace with `members = ["*"]`
(see `packages/stylus/contracts/Cargo.toml`), so the copied crate joins
the workspace automatically — no `Cargo.toml` edit needed. This directory
is skill-owned scratch, not repo source; it is deleted in Step 8 and must
never be `git add`ed.

```bash
cd packages/stylus/contracts/erc20-example
cargo stylus check --endpoint http://127.0.0.1:8547
cargo stylus deploy --endpoint http://127.0.0.1:8547 \
  --private-key 0xb6b15c8cb491557369f3c7d2c287b053eb229daa9c22138887752191c9520659 \
  --no-verify
cd -
```

(The private key is the nitro-devnode's well-known prefunded dev account,
the same one `nitro-devnode/start-chain-with-cors.sh` uses — not a secret.)

Assertion: `cargo stylus check` reports a WASM size over 24576 bytes /
2+ activation fragments, and `cargo stylus deploy` completes with a
receipt status of 1 (no `execution reverted`).

- `npx create-stylus@latest` fails to fetch (network/npm registry issue)
  → **(b) DID NOT RUN**.
- The fetched fixture is under 24KB / 1 fragment (upstream template
  shrank) → **(b) DID NOT RUN — fixture no longer exceeds the
  multi-fragment threshold; this step proves nothing until the fixture is
  swapped for a bigger one.**
- `cargo stylus check` or `deploy` errors with `execution reverted` while
  the fixture is confirmed >24KB → **(c) RAN and failed** — this is
  exactly the regression PR #80 fixed, resurfacing.
- Check and deploy both succeed on a confirmed >24KB fixture → **(a)**.

## Step 6 — Start the frontend

```bash
yarn start &
NEXTJS_PID=$!
```

Runs `next dev` (port 3000) via the `@ss/nextjs` workspace.

Assertion — poll up to 90s (first compile can be slow):

```bash
timeout 90 bash -c \
  'until [ "$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000)" = "200" ]; do sleep 2; done'
```

- Port 3000 already bound, or the process exits immediately → **(b) DID
  NOT RUN** if caused by environment (should have been caught in
  preflight); **(c)** if `next dev` starts then crashes with a build/type
  error.
- Responds 200 within 90s → **(a)**.

## Step 7 — Browser E2E (the whole chain, proven live)

Use the `claude-in-chrome` browser tools for this step. Load them first
(`ToolSearch` for `tabs_context_mcp`, `navigate`, `computer`, `read_page`,
`tabs_create_mcp`) if not already loaded.

**Never trigger a native browser dialog** (`alert`/`confirm`/`prompt`).
This scaffold's flows (burner wallet, debug page) do not require one, but
if any UI element looks like it might spawn one (e.g. a "reset" or
"clear" button), skip it — a triggered dialog freezes the automation and
the session must then be unblocked by hand.

1. Navigate to `http://localhost:3000/debug`.
2. **Assert `your-contract` appears in the debug contract list with its
   read/write methods rendered** — not just that the page returned 200.
   A page that merely renders is not a pass; you must see the specific
   deployed contract with a live address.
3. Connect the wallet: click Connect → select the local burner wallet
   (RainbowKit `rainbowkitBurnerWallet`, wired in
   `packages/nextjs/services/web3/wagmiConnectors.tsx` — it signs locally,
   no external wallet popup, so it cannot itself trigger a native dialog).
4. Call the read method `greeting()`. Assert it returns
   `"Building Unstoppable Apps!!!"` (the constructor default in
   `packages/stylus/contracts/your-contract/src/lib.rs`).
5. Call the write method `setGreeting("smoke-test-<distinct-value>")`
   with a value distinguishable from the default, and let the burner
   wallet sign it. Wait for the transaction to confirm (success toast /
   receipt in the UI).
6. Call `greeting()` again. **Assert it now returns the value you just
   set.** This read-back is what proves the full chain — devnode ->
   deploy -> ABI generation -> scaffold hooks -> tx signing -> read-back
   — not just that a page rendered.
7. Take a screenshot as evidence of the read-back value on the debug
   page, and keep it with the run's report.

- Chrome extension / browser tools unavailable, or the debug page never
  loads → **(b) DID NOT RUN — browser automation unavailable**.
- Wallet won't connect, write tx reverts or never confirms, or the
  read-back value doesn't match what was written → **(c) RAN and
  failed**, with the mismatch and any console/network errors attached.
- All of steps 2–6 hold and the screenshot is captured → **(a)**.

## Step 8 — Teardown (ALWAYS, including on failure)

Run this regardless of the verdict from Steps 1–7 — on PASS, FAIL, or a
crash partway through. A leaked devnode or dev server poisons the *next*
run, and it will look like a port conflict in Step 0, not like "the last
run left something running."

```bash
# 1. Kill the Next.js dev server
kill "$NEXTJS_PID" 2>/dev/null
pkill -f "next dev" 2>/dev/null

# 2. Tear down the devnode container
docker rm -f nitro-dev

# 3. Kill the backgrounded chain script if still around
kill "$CHAIN_PID" 2>/dev/null

# 4. Remove the Step 5 scratch fixture — never let it reach git status
rm -rf packages/stylus/contracts/erc20-example

# 5. Restore the tracked file Step 4 legitimately modified
git checkout -- packages/nextjs/contracts/deployedContracts.ts

# 6. Remove the gitignored deployment artifacts Step 4 wrote
rm -rf packages/stylus/deployments

# 7. Verify no orphaned processes or dirty tree remain
docker ps -a --filter name=nitro-dev --format '{{.Names}}'   # expect empty
pgrep -f "next dev"                                          # expect no match
pgrep -f "start-chain-with-cors.sh"                           # expect no match
git status --porcelain -- packages/nextjs/contracts/deployedContracts.ts \
  packages/stylus/deployments packages/stylus/contracts/erc20-example
                                                               # expect empty
```

- If any verification in step 7 above is non-empty, teardown itself
  **failed** — report this explicitly (it is not covered by the PASS/
  INCONCLUSIVE/FAIL verdict, but it must be surfaced, since it will
  cause the *next* run's Step 0 preflight to fail with a misleading
  "port busy" or "dirty tree" message).
- `deployedContracts.ts` is the one tracked file this skill is allowed to
  touch mid-run (Step 4) — teardown's `git checkout --` on it is what
  keeps the READ-ONLY contract's spirit intact: the working tree must be
  bit-for-bit unchanged by the time this skill exits.

## Common Mistakes

- Treating a missing tool, closed env gate, or busy port as anything
  other than **(b)**. These are silent-pass traps — they must surface as
  INCONCLUSIVE, never PASS.
- Skipping Step 3 because Step 2's script "already handles ArbOS 60" —
  Step 2 *attempts* the upgrade; Step 3 is the independent verification
  that it actually landed on this run's container.
- Skipping Step 5 because Step 4's small contract deployed fine —
  `your-contract` is under the 24KB single-fragment threshold and cannot
  exercise the multi-fragment code path at all.
- Calling Step 7 a pass because `/debug` returned 200. Rendering proves
  nothing about the deploy/ABI/signing chain; only the read-back
  assertion in Step 7.6 does.
- Editing `nitro-devnode/*.sh`, contract source, or frontend hooks to
  make a failing step pass. This skill is READ-ONLY — report the failure
  instead.
- Running Step 8 only on success. Teardown is unconditional.
