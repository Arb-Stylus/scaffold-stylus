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
build artifacts it restores on a PASS in Step 8 (`deployedContracts.ts`)
— see that step for the exact restore command. On FAIL/INCONCLUSIVE, Step
8 deliberately leaves this file modified — it is debugging evidence, not
a READ-ONLY violation; it gets restored the next time teardown actually
runs. The one standing exception is the additive `data-testid` attributes
Step 7's browser automation drives (see that step's "data-testid surface"
table) — pure attribute additions with no logic/render change, added once
as a one-time scope decision, not something a run of this skill edits.

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
Step 8 (teardown) is not itself part of the PASS/INCONCLUSIVE/FAIL
calculation, but whether it *runs at all* now depends on that verdict —
see Step 8: full teardown only happens on PASS; on FAIL, INCONCLUSIVE, or
a crash partway through, the live state is deliberately left running
instead. When teardown does run, a teardown failure must still be
reported, since a leaked devnode poisons the next run.

## Step 0 — Preflight

```bash
./.claude/skills/smoke-test/preflight.sh
```

Checks (in order): `node`, `yarn`, `docker` binary + daemon reachability
(`docker info`), `cast` (Foundry), `cargo`, `cargo stylus`, the
`SMOKE_TEST_CONFIRM` consent gate and the `packages/stylus/.env`
deploy-credentials gate (see Step 1), that the fixed RPC port 8547 is free
(see "DO NOT make port 8547 dynamic" below), and that no artifact from a
prior unclean run is already sitting in the working tree
(`packages/nextjs/contracts/deployedContracts.ts`,
`packages/stylus/deployments`, `packages/stylus/contracts/erc20-example`).

Port 3000 is arbitrary, not fixed, so a busy 3000 does not abort the run:
preflight instead probes upward from 3000 (3000, 3001, ... capped at 20
attempts) for the first free port, and prints it as `FRONTEND_PORT=<port>`
on the last line of output when it exits 0. A busy 3000 is often a dev
server leaked from a prior smoke-test run, so the probe does not skip
silently — for every occupied port it names the holder's PID and full
command (via `lsof`/`ps`, never killing it) before trying the next one, so
a leak from this repo's own `next dev` stays visible instead of being
routed around. The final chosen port is echoed prominently
(`>>> FRONTEND_PORT=<port> <<<`) so it isn't buried in the rest of the
preflight output. Capture the value and export it for the rest of the run:

```bash
export FRONTEND_PORT=<value printed by preflight.sh>
```

Every downstream step that needs the frontend port — Step 6's launch and
readiness poll, Step 7's browser navigation — uses `$FRONTEND_PORT`, never
a hardcoded `3000`. Report the chosen port in the run's final output.

- Exit 0 → proceed to Step 2, using the printed `FRONTEND_PORT`.
- Exit 1 (missing tool), 3 (RPC port 8547 busy), 4 (dirty tree from a
  leaked prior run), or 6 (no free frontend port found in the probed
  range) → **(b) DID NOT RUN** for every downstream step; stop here.
- Exit 2 (consent gate closed) or 5 (deploy-credentials gate closed) →
  see Step 1; **(b) DID NOT RUN** for the whole run.

## Step 1 — Gates (two, both required)

Two distinct, independent gates must both pass before Step 2 starts the
devnode. Neither is optional and neither substitutes for the other.

### Step 1a — Consent gate

Explicit opt-in is required before this skill touches anything:

```bash
export SMOKE_TEST_CONFIRM=1
```

**Why a gate:** this skill binds host port 8547 and a frontend port
(probed from 3000 upward), runs a Docker container, deploys real (if
throwaway) contracts, and drives a live browser session with a burner
wallet. It must never fire as a silent side effect of another skill or an
automated loop.

- `SMOKE_TEST_CONFIRM` set → **(a)**, proceed.
- Unset → **(b) DID NOT RUN — env absent.** Tell the caller to set it and
  stop; do not assume consent.

### Step 1b — Deploy-credentials gate

`yarn deploy` (Step 4) reads its devnet `ACCOUNT_ADDRESS` / `RPC_URL` /
`PRIVATE_KEY` from `packages/stylus/.env`. That file does not exist in a
fresh clone, and `packages/stylus/.env.example` ships its entire `##
devnet` block commented out (only `DEPLOYMENT_DIR=` is uncommented, and
it's blank). Without this gate, Step 4 dies on a missing/blank value
*after* Step 2 has already bound ports and started Docker — check this
**before** Step 2, not after.

`preflight.sh` checks that `packages/stylus/.env` exists and has
non-blank, uncommented `ACCOUNT_ADDRESS=`, `RPC_URL=`, and `PRIVATE_KEY=`
lines. It never reads the rest of the file's contents back to the
terminal (that file may also hold real sepolia/mainnet secrets in other
blocks) and it never creates or edits the file itself.

- All three devnet keys present and non-blank → **(a)**, proceed.
- File missing, or any of the three keys missing/blank → **(b) DID NOT
  RUN — env absent.** Halt and ask a human to create/edit
  `packages/stylus/.env` with this exact block — these are the
  nitro-devnode's own well-known prefunded dev values (the private key is
  hardcoded in plaintext at `nitro-devnode/run-dev-node.sh` line 7), not a
  secret to invent or protect:

  ```
  DEPLOYMENT_DIR=deployments

  ## devnet
  ACCOUNT_ADDRESS=0x3f1Eae7D46d88F08fc2F8ed27FCb2AB183EB2d0E
  RPC_URL=http://127.0.0.1:8547
  PRIVATE_KEY=0xb6b15c8cb491557369f3c7d2c287b053eb229daa9c22138887752191c9520659
  ```

  Never auto-write this block into `.env` on the human's behalf, never
  invent or guess different values, and never echo back any *other*
  content already in the file (it may contain real secrets for other
  networks).

## Step 2 — Start the devnode

```bash
CHAIN_LOG=$(mktemp -t smoke-test-chain.XXXXXX.log)
CHAIN_PID=$(node .claude/skills/smoke-test/launch-detached.mjs "$CHAIN_LOG" ./nitro-devnode/start-chain-with-cors.sh)
node .claude/skills/smoke-test/state.mjs set chainPid "$CHAIN_PID"
```

Launched via `launch-detached.mjs`, not a plain `cmd &`: the devnode
process is detached from this shell/session (Node's `spawn({detached:
true})` calls `setsid(2)` directly, so it survives the session that
started it — e.g. the invoking shell or session being closed — the same way
a leaked container used to outlive a killed shell but the wrapper script
around it didn't). Its PID is recorded in the shared state file
(`.claude/skills/smoke-test/.smoke-state.json`, via `state.mjs`) rather
than only living in this shell's `$CHAIN_PID` variable, so Step 8's
teardown (and a human's escape hatch, on FAIL) can find and kill it even
from a fresh shell. See "Detached processes and the state file" below Step
8 for the full rationale.

This runs `nitro-devnode/start-chain-with-cors.sh`, which `docker run
--name nitro-dev -p 8547:8547 ...`, waits for the RPC, calls
`becomeChainOwner()`, and (as of the ArbOS-60 fix) schedules the ArbOS 60
upgrade itself. Do not schedule it again here — Step 3 only *verifies* it
landed.

Assertion — poll until the RPC answers, capped at 90s. Uses `$SECONDS`
(a bash/zsh builtin) for the bound instead of GNU coreutils `timeout`,
which is not present on stock macOS:

```bash
deadline=$((SECONDS + 90))
until curl -s -X POST -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"net_version","params":[],"id":1}' \
    http://127.0.0.1:8547 | grep -q result; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "timed out waiting for devnode RPC" >&2
    exit 1
  fi
  sleep 1
done
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
is skill-owned scratch, not repo source; it must never be `git add`ed. On
PASS it is deleted in Step 8; on FAIL/INCONCLUSIVE it is deliberately left
in place as debugging evidence until `teardown.sh` is run by hand.

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

**Use `cargo stylus check` to measure/validate the contract. Do NOT use
plain `cargo build`.** `cargo build` fails on the host target for this
contract (and for `your-contract`) because of a known
`openzeppelin-stylus 0.3.0` / `stylus-sdk 0.9.0` VM mismatch — it is
**expected and pre-existing**, not a regression, and not caused by any
toolchain upgrade. A rustc 1.89 -> 1.91 bump is in flight on another
branch right now; if you run `cargo build` here and hit this failure, do
not attribute it to that upgrade and do not report it as a bug to fix —
`cargo stylus check` (which builds for `wasm32-unknown-unknown`, not the
host) is the correct command and does not hit this mismatch.

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

Launch the `next` binary directly rather than through `yarn`/`yarn start`
(which is `yarn workspace @ss/nextjs dev` -> `next dev`, per the root and
`packages/nextjs` `package.json` scripts) — going through `yarn` would put
an extra wrapper PID between us and the real dev-server process. `next
dev` itself listens for SIGINT/SIGTERM, forwards it to the child process
it forks internally, and SIGKILLs that child on its own exit — so a
single captured PID is sufficient to tear down cleanly.

Launched via `launch-detached.mjs`, same as Step 2's devnode, so it
survives this shell/session exiting; its PID is recorded in the state
file, not just a shell variable:

```bash
NEXTJS_LOG=$(mktemp -t smoke-test-nextjs.XXXXXX.log)
NEXTJS_PID=$(PORT="$FRONTEND_PORT" node .claude/skills/smoke-test/launch-detached.mjs \
  "$NEXTJS_LOG" packages/nextjs/node_modules/.bin/next dev packages/nextjs)
node .claude/skills/smoke-test/state.mjs set nextjsPid "$NEXTJS_PID"
node .claude/skills/smoke-test/state.mjs set frontendPort "$FRONTEND_PORT"
```

Runs `next dev` on `$FRONTEND_PORT` (chosen in Step 0 — Next.js honours
the `PORT` env var when no explicit `--port` is passed).

Assertion — poll up to 90s (first compile can be slow). Uses `$SECONDS`
instead of GNU coreutils `timeout`, which is not present on stock macOS:

```bash
deadline=$((SECONDS + 90))
until [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:${FRONTEND_PORT})" = '200' ]; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "timed out waiting for frontend to respond 200" >&2
    exit 1
  fi
  sleep 2
done
```

- `$FRONTEND_PORT` already bound (shouldn't happen — Step 0 just probed
  it free, but something else could have grabbed it in the interim), or
  the process exits immediately → **(b) DID NOT RUN** if caused by
  environment; **(c)** if `next dev` starts then crashes with a
  build/type error.
- Responds 200 within 90s → **(a)**.

## Step 7 — Browser E2E (the whole chain, proven live)

Driven by pure Chrome DevTools Protocol via
`.claude/skills/smoke-test/browser-e2e.mjs` — **zero new dependencies**
(Node 24's native `WebSocket`/`fetch` are the whole transport). This
replaced driving the browser through the `claude-in-chrome` MCP
extension, which needs a human-attached browser, cannot run in CI, and
stopped working outright (three consecutive "not connected" failures).
Do not reintroduce the extension for this step, and do not add
puppeteer/playwright/chrome-remote-interface/ws or any other package —
if it can't be done with the Node standard library, stop and report that.

```bash
FRONTEND_PORT="$FRONTEND_PORT" node .claude/skills/smoke-test/browser-e2e.mjs
```

The script launches an isolated, detached Chrome (fresh `--user-data-dir`
temp profile, probed-free `--remote-debugging-port`, headless by default
— set `SMOKE_TEST_HEADFUL=1` for a visible window while debugging
locally), drives it entirely through `Runtime.evaluate` (never synthetic
mouse coordinates — coordinates are the fragile, flaky part of browser
automation), and polls bounded conditions instead of sleeping a fixed
duration wherever there isn't a CDP event to wait on instead. It asserts,
in order:

1. Navigate to `http://localhost:$FRONTEND_PORT/debug`.
2. **`your-contract`'s `setGreeting` write form actually renders** (via
   `[data-testid="write-function-form-setGreeting"]`) — not just that the
   page returned 200. A page that merely renders is not a pass.
3. `greeting()` reads back the constructor default. Note: `displayTxResult()`
   (`packages/nextjs/app/debug/_components/contract/utilsDisplay.tsx`)
   `JSON.stringify()`s plain string results, so the rendered text is
   `"Building Unstoppable Apps!!!"` **including the literal quote
   characters** — match that exact form, not the bare string.
4. The burner wallet is connected. It is IN-PAGE, not an extension — no
   native dialog, so headless works identically to headful here. **Do not
   assume a manual "Connect" click is required**: for the `arbitrumNitro`
   network with `onlyLocalBurnerWallet` (`scaffold.config.ts`),
   `ScaffoldEthAppWithProviders.tsx` calls `initBurnerPK()` unconditionally
   on mount and wagmi auto-reconnects the burner connector, so the wallet
   is very often already connected by the time the write form renders.
   Check for that first; only drive the `[data-testid="connect-wallet"]`
   → `[data-testid="burner-account-option"]` flow if a Connect button is
   actually present. Selecting an account calls `window.location.reload()`
   — wait on the CDP `Page.loadEventFired` event for that reload, not a
   poll (polling `document.readyState` right after a client-side reload
   can race and read the OLD document's already-"complete" state).
5. Submit `setGreeting("smoke-test-<distinct-value>")` via
   `[data-testid="write-function-submit"]`, after setting
   `[data-testid="function-input"]`'s value through React's **native
   input value setter** (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,
   "value").set`) plus a manually dispatched `input` event — plain
   `input.value = x` does not work on a React-controlled input; React's
   own setter shadows the native one, the component's state never
   updates, and the form silently submits empty.
6. Poll `[data-testid="display-variable-greeting"] [data-testid="display-variable-value"]`
   until it equals the new value. This single poll proves both that the
   tx confirmed and that the read-back matches what was written — the
   real assertion is this on-chain value changing, not a prose toast
   string.
7. Screenshot via `Page.captureScreenshot`, saved under
   `$TMPDIR/smoke-test-artifacts/`.
8. Navigate to `/blockexplorer` and page through blocks **while the
   devnode is mining continuously** (the script runs a background
   `cast send` loop for the duration of this check) — confirming rows via
   `[data-testid="blockexplorer-*"]` do not shift, duplicate, or blank out
   across the page-forward click. This is the regression check
   `useFetchBlocks.ts`/`app/blockexplorer/**` exist for (hand-ported from
   upstream in `351a34a`, never previously run against a live devnode).

Every interactive element the script drives has an additive
`data-testid` (see "data-testid surface" below) — the script does not
match on visible text or CSS classes to find anything, only to read a
value out of an element it already found by testid.

- Chrome/Chromium binary not found, no free debugging port, or the CDP
  endpoint/debug page never comes up within its bounded timeout → script
  exits 1 → **(b) DID NOT RUN — browser automation unavailable**.
- Wallet won't connect, write tx never confirms/reverts, the read-back
  value doesn't match, or the block explorer shows a duplicate/blank row
  under live mining → script exits 2 → **(c) RAN and failed**, with the
  mismatch (and the screenshot) attached.
- All assertions hold and both screenshots are captured → script exits 0
  → **(a)**.

On exit 0 the script kills its own Chrome and removes its temp profile
dir. On exit 1/2 it leaves Chrome running (same "preserve failure state"
policy as Step 8) and records its PID/debug port/profile dir in the state
file so `teardown.sh`'s escape hatch can find and clean it up later.

### data-testid surface

These are additive-only tags on the exact elements this script drives —
no logic/render changes. They are rsynced into the `create-stylus` npm
template, so treat them as a small public surface: kebab-case, name the
element (not what the test does with it), no emoji, no copy fragments.

| testid | file:line |
| --- | --- |
| `connect-wallet` | `packages/nextjs/components/scaffold-eth/RainbowKitCustomConnectButton/index.tsx` |
| `burner-account-option` | `packages/nextjs/components/scaffold-eth/RainbowKitCustomConnectButton/BurnerWalletModal.tsx` |
| `write-function-form-<fnName>` | `packages/nextjs/app/debug/_components/contract/WriteOnlyFunctionForm.tsx` |
| `write-function-submit` | `packages/nextjs/app/debug/_components/contract/WriteOnlyFunctionForm.tsx` |
| `function-input` | `packages/nextjs/components/scaffold-eth/Input/InputBase.tsx` |
| `display-variable-<fnName>` | `packages/nextjs/app/debug/_components/contract/DisplayVariable.tsx` |
| `display-variable-value` | `packages/nextjs/app/debug/_components/contract/DisplayVariable.tsx` |
| `blockexplorer-table` | `packages/nextjs/app/blockexplorer/_components/TransactionsTable.tsx` |
| `blockexplorer-row` | `packages/nextjs/app/blockexplorer/_components/TransactionsTable.tsx` |
| `blockexplorer-block-number` | `packages/nextjs/app/blockexplorer/_components/TransactionsTable.tsx` |
| `blockexplorer-prev-page` / `blockexplorer-next-page` / `blockexplorer-page-label` | `packages/nextjs/app/blockexplorer/_components/PaginationButton.tsx` |

Nothing was left untagged/fragile — every element the script interacts
with has a testid. If a future revision of this script needs to target a
new element, tag it the same way rather than falling back to text/class
matching.

## Step 8 — Teardown (conditional on verdict)

Whether this step tears anything down now depends on the outcome of
Steps 1–7:

- **Verdict is PASS** → tear down fully, exactly as before.
- **Verdict is FAIL, INCONCLUSIVE, or the run crashed partway through
  before reaching a verdict** → do **NOT** tear down. A live failure
  state is the only thing you can actually debug — tearing it down
  forces a full re-run of devnode + deploy + frontend just to get back
  to the moment of failure. Leave the devnode container and the dev
  server running and leave the artifacts in place; print the escape
  hatch instead (below).

The actual teardown logic lives in a standalone, idempotent script —
`.claude/skills/smoke-test/teardown.sh` — precisely so that "the exact
teardown command" quoted in the escape hatch is a real, single,
copy-pasteable command and not a list of steps to retype. It is safe to
run twice and safe to run when nothing is alive: killing an already-dead
PID and removing an already-absent container both no-op quietly, and
nothing in the script is allowed to start erroring on a repeat run.

**`teardown.sh` reads PIDs from the state file
(`.claude/skills/smoke-test/.smoke-state.json`) by default** — it needs
no arguments at all. This matters now that Steps 2/6/7 launch their
processes detached (survives the session that started them — see
"Detached processes and the state file" below): a PID sitting only in
`$NEXTJS_PID`/`$CHAIN_PID` in this shell is not enough anymore, since a
human debugging a FAIL will very likely be in a *different* shell/session
by the time they run teardown. `NEXTJS_PID=<pid> CHAIN_PID=<pid>` env
vars still override the state file, for the rare case you want to target
something else.

### On PASS

```bash
.claude/skills/smoke-test/teardown.sh
```

- If the script's own step-7 verification prints any `LEAKED:` line or
  non-empty `git status`, teardown itself **failed** — report this
  explicitly (it is not covered by the PASS/INCONCLUSIVE/FAIL verdict,
  but it must be surfaced, since it will cause the *next* run's Step 0
  preflight to fail with a misleading "port busy" or "dirty tree"
  message).
- `deployedContracts.ts` is the one tracked file this skill is allowed to
  touch mid-run (Step 4) — the script's `git checkout --` on it is what
  keeps the READ-ONLY contract's spirit intact on a PASS: the working
  tree must be bit-for-bit unchanged by the time this skill exits.
- Step 7's `browser-e2e.mjs` already killed its own Chrome and cleared its
  state-file keys on its own exit 0, so there's normally nothing Chrome-
  related left for this script to do on a PASS.

### On FAIL / INCONCLUSIVE / crash

Do not call `teardown.sh`. Instead print an escape hatch with this run's
actual literal values substituted in (not `$VAR` references — the reader
will use these in a fresh shell where the variables aren't set; get them
with `node .claude/skills/smoke-test/state.mjs dump` if they've scrolled
out of view):

```
=== Smoke test did not pass — live state left running for debugging ===
Frontend:      http://localhost:<FRONTEND_PORT>/debug
NEXTJS_PID:    <NEXTJS_PID>
CHAIN_PID:     <CHAIN_PID>
Container:     nitro-dev
CHROME_PID:    <chromePid, if Step 7 got far enough to launch one>
Chrome debug:  http://127.0.0.1:<chromeDebugPort>/json

All of the above genuinely survive this session ending — they were
launched detached (launch-detached.mjs / browser-e2e.mjs's spawn with
detached:true), specifically so this escape hatch isn't printing PIDs
that are already dead by the time you read them.

The working tree is left DIRTY on purpose: packages/nextjs/contracts/
deployedContracts.ts stays modified and packages/stylus/deployments
stays present — they are evidence of this run's deploy. The next
preflight run will hit exit 4 (dirty tree) until this is cleaned up;
that is the intended loud signal that a prior run failed and was never
torn down, not a mysterious bug. Do not treat exit 4 as "something is
broken" without first checking whether it's this.

When done debugging, tear everything down with (no arguments needed --
it reads .smoke-state.json):
  .claude/skills/smoke-test/teardown.sh
```

### Detached processes and the state file

Before this fix, Steps 2/6 launched the devnode and frontend as plain
`cmd &` background jobs. That PID lived only in a shell variable, and the
process itself stayed in the same process group as the shell that
started it. Both of those broke the FAIL-path escape hatch above: the
invoking shell or session ending sends its terminating signal to that whole
process group, killing the "preserved" devnode and frontend along with it, so
the escape hatch printed PIDs that were already dead by the time a human
read them — teardown-on-FAIL was theatre, not a real safety net.

The fix has two parts, used by Steps 2, 6, and (on FAIL) 7:

- **`launch-detached.mjs`** launches a command via Node's
  `spawn({detached: true})`, which calls `setsid(2)` directly through
  libuv on POSIX — making the child a new session/process-group leader,
  immune to signals sent to the launching shell's group. (Deliberately
  *not* implemented by shelling out to the `setsid` CLI binary: that's
  util-linux and isn't present on macOS by default, unlike the libuv
  syscall path, which works identically on macOS and Linux.)
- **`state.mjs`** is the durable record of what's alive —
  `.claude/skills/smoke-test/.smoke-state.json` (gitignored), keyed by
  `chainPid`, `nextjsPid`, `frontendPort`, and (only when Step 7 leaves
  Chrome running on a non-PASS exit) `chromePid`/`chromeDebugPort`/
  `chromeUserDataDir`. `teardown.sh` reads it instead of relying on shell
  variables that don't outlive the session; `preflight.sh` also checks
  for a leftover state file as a leaked-prior-run signal, the same class
  of check as the dirty-tree check next to it.

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
  assertion (Step 7, sub-step 6) does.
- Editing `nitro-devnode/*.sh`, contract source, or frontend hooks to
  make a failing step pass. This skill is READ-ONLY — report the failure
  instead. (`data-testid` attributes added to drive Step 7 are the one
  approved exception — additive only, never a logic/render change.)
- Tearing down on FAIL/INCONCLUSIVE. Full teardown now runs only on
  PASS — on any other outcome, leave the live state running and print
  the escape hatch instead; see Step 8.
- Printing the escape hatch with literal `$NEXTJS_PID`/`$CHAIN_PID`/
  `$FRONTEND_PORT`/`$CHROME_PID` text instead of the run's actual values.
  The reader won't have those variables set in a fresh shell.
- Setting a React-controlled `<input>`'s value with plain
  `input.value = x` in Step 7. React shadows the native setter, so the
  component's own state never updates and the form submits empty — use
  the native setter via `Object.getOwnPropertyDescriptor` plus a
  dispatched `input` event (see Step 7, sub-step 5).
- Assuming Step 7 must click a "Connect" button. For the local devnode
  network the burner wallet auto-connects on page load; the script must
  check for the already-connected state first (see Step 7, sub-step 4).
- Reintroducing the `claude-in-chrome` MCP extension for Step 7, or
  adding puppeteer/playwright/chrome-remote-interface/ws to make browser
  automation easier. Pure CDP with zero new dependencies is the point —
  every dependency here is inherited by every fork and by
  `create-stylus`.
