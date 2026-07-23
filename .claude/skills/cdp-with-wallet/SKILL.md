---
name: cdp-with-wallet
description: Use when a task needs a real MetaMask wallet driven end-to-end (unlock, connect via EIP-6963, approve a transaction) against a live network like Arbitrum Sepolia, without a human clicking the extension popup. Triggers on requests to automate MetaMask, drive a real wallet transaction, or record a browser demo that needs a connected wallet.
---

# cdp-with-wallet

## Overview

`scaffold.config.ts`'s `onlyLocalBurnerWallet: true` hides the burner wallet
on any network other than the local devnode, so proving the frontend half of
a real deploy (e.g. Arbitrum Sepolia) needs an actual wallet extension
connected and signing. `smoke-test`'s Step 9 deliberately stops at
deploy-and-read-back for exactly this reason — driving a real wallet was out
of scope there.

This skill closes that gap with raw Chrome DevTools Protocol over
WebSocket, **zero npm dependencies**, matching the in-repo precedent
`.claude/skills/smoke-test/browser-e2e.mjs` (same CDP client shape, same
findFreePort/waitForCdpReady idiom). The blueprint technique is Brove's
`packages/nextjs/e2e/helpers/braavos.ts`: enumerate CDP targets from
`GET http://localhost:<port>/json`, find the extension's own page by URL
prefix, attach a WebSocket directly to it. Braavos is a different extension
with different selectors -- only the *technique* carries over.

**A trap to not fall into:** Brove's `chrome-cdp-profile/SKILL.md` says
extension popups "cannot be automated and must be clicked by hand." That is
a limitation of Brove's page-only `agent-browser` tool, not of CDP itself --
`braavos.ts` in that same repo automates the extension directly. This skill
does the same thing for MetaMask.

## Files

```
.claude/skills/cdp-with-wallet/
  SKILL.md        this file
  preflight.mjs    checks every prerequisite, SKIPs (never hard-fails) on a gap
  launch.mjs       Chrome launcher: profile handling, dynamic CDP port, PID
                   registry, single-wallet extension isolation
  metamask.mjs     unlock() / connect() / approveTx() / waitForTarget()
```

## Can-do / cannot-do

| Can do | Cannot do |
|---|---|
| Unlock an already-initialised MetaMask vault given its password -- **live-proven end to end** (see "Measured unknowns") | Create a wallet, import a seed phrase, or otherwise initialise a vault (see Onboarding -- by design, not a limitation) |
| Select MetaMask's connector via EIP-6963 `rdns === "io.metamask"`, deterministically, regardless of how many other wallets are installed | Guarantee any *other* extension's popups are automatable the same way -- only MetaMask's `notification.html` shape has been reasoned about here |
| Approve a connection, a `wallet_addEthereumChain` request, or a transaction popup by finding and clicking its real button via CDP -- all three use the same `confirm-footer-button`/`confirm-btn` mechanism, live-confirmed | Read or validate what a transaction actually does before approving it -- it clicks Confirm, it does not decide whether confirming is safe. Isolation (testnet-only funds, single-wallet profile) is the actual safety control, not this script's judgement |
| Run against a dynamically-probed CDP port, so multiple runs / other Chrome usage don't collide on a fixed port | Assume `--disable-extensions-except` isolates MetaMask -- **measured false**, see below |
| Recover from a crash mid-run via `node launch.mjs teardown` (kills leaked Chrome AND restores any extensions it disabled) -- live-tested against a real crashed ad-hoc script | Guarantee zero risk if the *real* automation script itself crashes between disabling extensions and calling `restoreExtensions()` -- always run `node launch.mjs teardown` afterward as a matter of course, not only when something visibly went wrong |
| Detect a not-yet-onboarded machine and say so with an exact fix command, INCLUDING a Keychain entry that exists but holds the wrong password (see prerequisite 4) | Fix a not-yet-onboarded machine automatically -- see Onboarding |

## Measured unknowns

The design for this skill called out four things as "measure, don't reason
about" because each has a plausible-sounding wrong answer. All four are now
answered, live, on this machine (Chrome 150.0.7871.129, MetaMask 13.35.1.0) --
the first two below during initial development (2026-07-22), the last two
during a live, end-to-end run against Arbitrum Sepolia once a human had
actually completed onboarding (also 2026-07-22, several hours later --
see Onboarding for why that gap mattered):

1. **`--disable-extensions-except` with an installed (not unpacked)
   extension.** Measured **false**: passing it either the installed
   extension's on-disk directory path or its bare extension ID disabled
   **every** extension, including the one named -- confirmed via
   `chrome.developerPrivate.getExtensionsInfo()` returning an empty list
   either way. That flag's allow-list only matches extensions loaded via
   `--load-extension` (unpacked/dev-mode); it does not recognize
   Web-Store-installed ones at all, so pointing it at one is equivalent to
   disabling everything. **Working alternative** (what `launch.mjs`
   actually does): after CDP is up, open a `chrome://extensions` tab and
   call `chrome.management.setEnabled(id, false)` directly from that page's
   own JS context. That API is available there, unrestricted, without
   toggling Developer Mode, for Web-Store-installed extensions.

2. **MetaMask 13.35.1.0 selectors.** **Live-confirmed end to end.** Every
   selector `metamask.mjs` uses for unlock/connect/approve is exactly what
   was clicked in a real run (see the "LIVE-VERIFIED" block at the top of
   that file) -- not carried over from another project or another MetaMask
   version. Getting here surfaced two real bugs, both fixed in this PR:
   - LavaMoat "scuttling" blocks the classic React-controlled-input trick
     (grabbing `HTMLInputElement.prototype`'s value setter) with `Error:
     LavaMoat - property "HTMLInputElement" of globalThis is inaccessible
     under scuttling mode`. Fixed by focusing the element with a plain
     `el.focus()` call and using CDP's own `Input.insertText`, which never
     touches page globals.
   - `unlock()`'s locked/unlocked check ran after a fixed 1500ms sleep --
     on this machine's headless launch, the app had rendered **nothing**
     yet at that point (zero `[data-testid]` elements at all), so the
     check silently read "no unlock screen visible" as "already unlocked"
     without ever testing the password. Fixed by polling for the app to
     render something recognizable before deciding lock state, instead of
     a fixed sleep.

3. **The transient-popup race.** Measured directly: the first
   `GET /json/list` poll immediately after firing `eth_sendTransaction`
   found no `notification.html` target at all; it appeared roughly a
   second later. `waitForTarget()`'s poll-with-timeout design (mirroring
   `browser-e2e.mjs`'s `waitFor()`) handled this correctly in the live run.

4. **Is Arbitrum Sepolia already configured in this MetaMask instance?**
   Measured **no** -- confirmed twice, hours apart (`NetworkController.
   networkConfigurationsByChainId` never included `0x66eee` before the live
   run added it). Driving `wallet_addEthereumChain` from a dapp page (see
   Procedure) pops the same confirmation-screen component `approveTx()`
   already knows how to click (`confirm-footer-button`) -- MetaMask
   resolved the request by both adding AND switching to the network in a
   single confirmation, no second popup. `eth_chainId` read back `0x66eee`
   immediately after.

### Live end-to-end proof

Real transaction on Arbitrum Sepolia, driven entirely through this skill's
primitives (`unlock()` -> `wallet_addEthereumChain` + `approveTx()` ->
`connect()` -> `eth_sendTransaction` + `approveTx()`):

- tx hash: `0x7c89e227ad9714a72f83925c7febcc52f5ba3e2cfddafa4d5c5773d279e0df8d`
- https://sepolia.arbiscan.io/tx/0x7c89e227ad9714a72f83925c7febcc52f5ba3e2cfddafa4d5c5773d279e0df8d
- `cast receipt` confirms `status: 1 (success)`, block 290078542, chainId
  421614 (`0x66eee`), from/to `0x777d569Bd3b0A2De007097A3D7E1687C5E5EB859`
  (the account imported in Onboarding step 3, matching
  `ACCOUNT_ADDRESS_SEPOLIA` in `packages/stylus/.env`).

## Chrome launch contract

- `--user-data-dir=$HOME/.chrome-debug-profile` (override: `CDP_WALLET_PROFILE_DIR`)
  -- the shared debug profile. Never a throwaway one for the real run: the
  whole point is driving the same MetaMask install a human would use.
- `--remote-debugging-port=<dynamically probed, from 9222>` -- never fixed,
  so more than one Chrome (e.g. a preflight vault-check racing a real
  automation run) doesn't collide.
- No `--disable-extensions-except` (see measured unknown 1 above). Isolation
  happens post-launch via `launch.mjs`'s `isolateExtensions()`.
- **Headless by default** (`launchChrome()`'s `headless` parameter defaults
  to `true`). MEASURED, not assumed: Chrome's `--headless=new` mode (unlike
  its older headless mode) runs extensions -- proven directly by this
  skill's own preflight checks and its live end-to-end Sepolia run, both
  driven entirely with `headless: true`. A visible window stealing focus
  for routine automation is a real cost; the parameter stays available
  (`headless: false`) but nothing has to opt in to get the non-disruptive
  default. Recording a demo video does **not** need `headless: false` --
  an earlier design assumed macOS `screencapture -v` (which does need a
  real window) but that path hit a real Screen Recording TCC permission
  gate; `demo-video` (PR 2) instead uses CDP's own `Page.startScreencast`,
  which captures frames from inside Chrome regardless of headless state.
- Select the connector by **EIP-6963 `rdns === "io.metamask"`**, never by
  button position -- the debug profile holds 5 other wallet-shaped
  extensions (Braavos, Keplr, Xverse, UniSat, and the "Ready X" smart
  wallet) plus an "Allow CORS" extension; leaving them enabled makes the
  dapp's connector list order non-deterministic, and a CORS-bypass
  extension makes any recording unrepresentative of what a real user sees.

## Procedure

```js
import { launchChrome, findFreePort, waitForCdpReady, isolateExtensions, restoreExtensions, killChromeGroup, METAMASK_EXTENSION_ID } from "./launch.mjs";
import { unlock, connect, approveTx } from "./metamask.mjs";

const port = await findFreePort(9222);
const chrome = launchChrome({ port, userDataDir: `${process.env.HOME}/.chrome-debug-profile` });
await waitForCdpReady(port);
const { disabledIds } = await isolateExtensions(port, METAMASK_EXTENSION_ID, chrome.pid);

try {
  const password = /* read via `security find-generic-password -s stylus-demo-metamask -w`, never echoed/logged */;
  await unlock({ port, extensionId: METAMASK_EXTENSION_ID, password });

  // If the target network isn't configured yet (LIVE-CONFIRMED: Arbitrum
  // Sepolia, 0x66eee, is not preconfigured -- see "Measured unknowns"),
  // trigger wallet_addEthereumChain from the dapp page's provider, then
  // approve the resulting popup with the SAME primitive used for a
  // transaction confirmation -- MetaMask renders both through the same
  // confirmation-screen component:
  //   dappCdp's provider.request({ method: "wallet_addEthereumChain", params: [{
  //     chainId: "0x66eee", chainName: "Arbitrum Sepolia",
  //     nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  //     rpcUrls: ["https://sepolia-rollup.arbitrum.io/rpc"],
  //     blockExplorerUrls: ["https://sepolia.arbiscan.io"],
  //   }] })
  await approveTx({ port, extensionId: METAMASK_EXTENSION_ID });

  // Navigate a separate CDP target to your dapp, attach a CDP session to it
  // (`dappCdp` below), THEN:
  const { accounts } = await connect({ port, extensionId: METAMASK_EXTENSION_ID, dappCdp });

  // Trigger the dapp's send/write action on dappCdp, then:
  await approveTx({ port, extensionId: METAMASK_EXTENSION_ID });
} finally {
  await restoreExtensions(port, disabledIds, chrome.pid); // always, regardless of outcome
  await killChromeGroup(chrome.pid);
}
```

`node launch.mjs teardown` is the escape hatch if a run crashes mid-flight:
it restores any extensions the crashed run disabled (using the same
registry the run itself wrote to synchronously) and kills any leaked Chrome
process groups it finds.

## Secret handling

```bash
security find-generic-password -s stylus-demo-metamask -w
```

The password must never be printed, echoed, logged, committed, or passed as
a literal command-line argument (which would land in shell history and
process listings). If you need to show it's set, print its length only.

The wallet being automated must hold **testnet funds only**. `approveTx()`
clicks Confirm; it does not read or understand what it's confirming.
Isolation -- a single-purpose Chrome profile, a testnet-only account -- is
the actual safety control, not this script's judgement.

## Process hygiene

Chrome's PID is recorded **synchronously at spawn**, before
`waitForCdpReady` or anything else that can throw -- a Chrome orphan
survived five hours undetected on 2026-07-21 because a PID was only ever
recorded on the failure path. Because the CDP port is probed dynamically
(not fixed, unlike smoke-test's devnode port), the record is an **array**
(`.cdp-wallet-state.json`) with dead-PID pruning on every read, not a
single record that a second concurrent launch could silently clobber.

The same crash-safety applies to extension isolation, not just Chrome
processes: `isolateExtensions()` persists the list of extensions it
disabled into that same registry entry, synchronously, before returning --
measured directly (2026-07-22) by isolating, then killing the process
without calling `restoreExtensions()`, then confirming `node launch.mjs
teardown` still found and re-enabled every disabled extension from the
registry alone. Without this, a crash between isolate and a later
`restoreExtensions()` call leaves the developer's other wallets disabled
with no trace of why -- the same failure shape as the Chrome-PID orphan,
just for extensions instead of processes.

`node launch.mjs list` prints the current registry (after pruning dead
PIDs). `node launch.mjs teardown` restores extensions for every live entry
that has any recorded, then kills the Chrome process group, then clears the
registry.

## Onboarding

This skill depends on machine-local state that does not exist in the repo.
Run `node .claude/skills/cdp-with-wallet/preflight.mjs` first -- it checks
every prerequisite below and SKIPs (never hard-fails) with the exact fix
when one is missing, the same contract as smoke-test's Steps 9a/9b.

**Exit code is three-way, not binary** (adopted from scaffold-stark,
2026-07-22) -- callers can rely on this to distinguish "fix your machine"
from "try again later":
| Exit | Meaning | Callers should |
|---|---|---|
| `0` | GREEN -- every prerequisite satisfied | proceed |
| `1` | RED -- a real, fixable gap (no vault, wrong/missing Keychain entry, MetaMask not installed, etc) | block, and act on the SKIP line's fix |
| `2` | INFRA -- every SKIP is environmental (Sepolia RPC unreachable, another Chrome window holding the debug profile) -- not a defect in this machine's setup | may choose not to block; a retry can legitimately succeed |

A bare 0/1 would make a transient network blip look identical to a
genuinely misconfigured machine -- and a gate that goes red on things
nobody can control is a gate people learn to ignore. If BOTH categories of
SKIP are present in the same run, exit `1` (RED) wins: a real setup gap
still needs fixing regardless of what else happened to be flaky.

**Before any of this -- fully quit any Chrome window already open against
the debug profile (Cmd+Q, not just closing the window).** Chrome only
allows one process to hold a given `--user-data-dir` at a time. MEASURED
(2026-07-22): with a developer's own interactive Chrome left open against
`$HOME/.chrome-debug-profile`, `preflight.mjs`'s checks that launch their
own Chrome can't get a CDP port up at all. Before this was fixed, that
surfaced as an opaque "CDP endpoint never became reachable (fetch failed)",
which reads like a broken launcher, not a profile-lock conflict -- the same
misdiagnosis shape as smoke-test Step 9c once reporting a missing `cast`
binary as "Sepolia RPC unreachable." `preflight.mjs` now detects this
specific case and names the conflicting PID directly. A fresh machine hits
this on its very first run, the moment someone opens the debug profile by
hand to check it exists.

| # | Prerequisite | Scriptable? |
|---|---|---|
| 1 | `$HOME/.chrome-debug-profile` exists | Yes -- `preflight.mjs` checks it |
| 2 | MetaMask installed in that profile | Yes to check, **no** to fix -- see below |
| 3 | MetaMask vault initialised | Yes to check (a live `chrome.storage.local` read, not a directory-size guess -- see below for why), **no** to fix -- see below |
| 4 | Keychain item `stylus-demo-metamask` present **and correct** | Yes to check (a live unlock attempt, gated on 3 passing -- see below), **no** to fix -- see below |
| 5 | Arbitrum Sepolia RPC reachable via `packages/stylus/.env`'s `RPC_URL_SEPOLIA` | Yes |

**Steps 2 and 3 cannot be scripted, and should not be** -- installing a
Chrome extension and importing a seed phrase are exactly the kind of action
this skill should never automate silently.

**Step 2 (install MetaMask):**
1. Launch Chrome with the debug profile: `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --user-data-dir="$HOME/.chrome-debug-profile"`
2. Go to the MetaMask Chrome Web Store page and click "Add to Chrome".
3. Close Chrome.

**Step 3 (initialise the vault) -- read this before doing it:**
1. Launch Chrome with the same profile and open the MetaMask extension.
2. Create a new wallet (or choose "I already have a wallet" if you have a
   seed phrase in mind) -- either way, set a password. **Note it down** --
   step 4 needs the exact same value.
3. **Fastest path for this repo, and what was actually done to produce
   this PR's live-run evidence:** once the wallet exists, go to the account
   menu -> **Import account -> Private Key**, and paste the value of
   `PRIVATE_KEY_SEPOLIA` from `packages/stylus/.env`. That account is
   **already funded** with Arbitrum Sepolia ETH -- no faucet trip needed,
   and the deployer address and the MetaMask account end up identical,
   which is convenient for matching up on-chain activity later. If you'd
   rather import a fresh seed instead and fund it yourself, that works too
   (see `readme.md`'s "Arbitrum Testnet Faucets" section) -- either way,
   **this account must be TESTNET-ONLY**, one that has never held and will
   never hold mainnet funds. `approveTx()` signs whatever it's pointed at
   without reading it; the account having nothing worth stealing is the
   actual safety boundary, not this skill's judgement.

**Step 4 (Keychain entry) -- and the gotcha that cost three round trips
while building this skill:**
```bash
security add-generic-password -s stylus-demo-metamask -a "$USER" -w
```
This prompts for the password interactively -- it is never echoed and never
touches shell history. Do **not** pass `-w <password>` as a literal
argument on the command line.

**The Keychain entry and the MetaMask password are set at two different
moments** -- this one now, the actual vault password back in step 3 -- **so
nothing keeps them in sync automatically, and they will silently drift** if
you change one without the other. This is exactly what happened while
building this skill: a Keychain entry created early in the session held a
26-character value; the password actually set in MetaMask during onboarding
was 13 characters with a period; `preflight.mjs`'s old existence-only check
reported OK regardless, and `unlock()` failed three steps later with
MetaMask's own "incorrect password" error. `preflight.mjs` check 4 now
performs a live unlock attempt (gated on check 3 having passed -- there is
nothing to unlock otherwise) instead of just checking the entry exists, so
this drift is now caught up front with an exact fix:
```bash
security add-generic-password -U -s stylus-demo-metamask -a "$USER" -w
```
(the `-U` flag updates the existing item -- a plain `add-generic-password`
without it exits with "the specified item already exists" and changes
nothing, which looks like success at a glance).

**Step 5 (Sepolia RPC):** copy `packages/stylus/.env.example` to
`packages/stylus/.env` if it doesn't exist, and fill in `RPC_URL_SEPOLIA` in
the `## sepolia` block (a public endpoint such as
`https://sepolia-rollup.arbitrum.io/rpc` works). Resolved from the git
repository root (`git rev-parse --git-common-dir`'s parent), not
`process.cwd()`, so this works whether `preflight.mjs` is run from the main
checkout or from a worktree -- `.env` is untracked and only exists wherever
a human actually put it (normally the main checkout).

**One more thing a fresh machine will hit on its first live run:** Arbitrum
Sepolia is not preconfigured in MetaMask (see "Measured unknowns" #4). This
isn't a separate manual onboarding step -- the skill drives it itself via
`wallet_addEthereumChain` + `approveTx()`, shown in Procedure above -- but
expect an extra confirmation popup the first time, and don't mistake it for
a bug.

Every check was verified in **all** the directions that exist for it:
`preflight.mjs`'s raw output for the induced-absent case (a non-existent
profile dir, a non-existent Keychain service name, a non-existent env file)
and for the real present case are both in this PR's evidence. Check 3
(vault) was verified in both directions on this machine, hours apart -- SKIP
before a human completed onboarding, OK after. Check 4 (Keychain password)
was verified in all three of its outcomes: entry absent, entry present but
wrong (the real drift above, and separately re-confirmed with a disposable
test Keychain entry holding a deliberately wrong value), and entry present
and correct -- the last of these driving a real, unlocked MetaMask session
through to a mined Arbitrum Sepolia transaction (see "Live end-to-end
proof" above).
