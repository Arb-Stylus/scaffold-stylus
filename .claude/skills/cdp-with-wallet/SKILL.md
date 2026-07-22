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
| Unlock an already-initialised MetaMask vault given its password | Create a wallet, import a seed phrase, or otherwise initialise a vault (see Onboarding -- by design, not a limitation) |
| Select MetaMask's connector via EIP-6963 `rdns === "io.metamask"`, deterministically, regardless of how many other wallets are installed | Guarantee any *other* extension's popups are automatable the same way -- only MetaMask's `notification.html` shape has been reasoned about here |
| Approve a connection or a transaction popup by finding and clicking its real button via CDP | Read or validate what a transaction actually does before approving it -- it clicks Confirm, it does not decide whether confirming is safe. Isolation (testnet-only funds, single-wallet profile) is the actual safety control, not this script's judgement |
| Run against a dynamically-probed CDP port, so multiple runs / other Chrome usage don't collide on a fixed port | Assume `--disable-extensions-except` isolates MetaMask -- **measured false**, see below |
| Recover from a crash mid-run via `node launch.mjs teardown` (kills leaked Chrome AND restores any extensions it disabled) | Guarantee zero risk if the *real* automation script itself crashes between disabling extensions and calling `restoreExtensions()` -- always run `node launch.mjs teardown` afterward as a matter of course, not only when something visibly went wrong |
| Detect a not-yet-onboarded machine and say so with an exact fix command | Fix a not-yet-onboarded machine automatically -- see Onboarding |

## Measured unknowns (2026-07-22)

The design for this skill called out four things as "measure, don't reason
about" because each has a plausible-sounding wrong answer. Here is what was
actually observed, live, on this machine (Chrome 150.0.7871.129, MetaMask
13.35.1.0):

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

2. **MetaMask 13.35.1.0 selectors.** **Could not be fully verified live** --
   see "Selector verification status" below. The onboarding screen's
   testids (`onboarding-create-wallet`, `onboarding-import-wallet`) ARE
   live-confirmed, since that screen was reachable. The unlock/connect/
   confirm screens were not reachable (no initialised vault -- see
   Onboarding), so their selectors in `metamask.mjs` are carried over from
   MetaMask's long-stable public test-id conventions, not observed on this
   build. **Confirm them the first time this skill runs against a real
   unlocked account.**

3. **The transient-popup race.** Designed defensively
   (`metamask.mjs`'s `waitForTarget()` polls `GET /json/list` on a bounded
   timeout, mirroring `browser-e2e.mjs`'s `waitFor()`), but not empirically
   timed -- that requires a live connect/tx flow, which requires an
   initialised vault (see Onboarding, again).

4. **Is Arbitrum Sepolia already configured in this MetaMask instance?**
   Measured **no**. `NetworkController.networkConfigurationsByChainId` on
   this machine lists `0x1, 0x18c7, 0x2105, 0x279f, 0x38, 0x89, 0xa, 0xa4b1,
   0xaa36a7, 0xe705, 0xe708` -- **no `0x66eee`** (Arbitrum Sepolia). Adding
   it is an additional popup flow (MetaMask's "Add network" confirmation)
   that this skill does not yet drive; plan for it before the first live
   run against Sepolia.

### Selector verification status -- read before trusting `metamask.mjs`

Two independent, measured blockers prevented verifying `unlock()`,
`connect()`, and `approveTx()`'s selectors against a real unlocked MetaMask
instance on this machine:

1. **The real debug profile's vault is not initialised.** `preflight.mjs`'s
   check 3 does a live read of `chrome.storage.local` via the extension's
   own service worker and found `KeyringController.vault` absent and
   `AccountsController.internalAccounts.accounts` empty (`{}`). MetaMask's
   own UI agrees: opening `home.html` redirects to `#/onboarding/welcome`,
   never to an unlock screen. This directly contradicts the assumption this
   skill was designed under ("MetaMask is already set up, only the
   password is needed") -- a non-empty `Local Extension Settings/<id>`
   directory (9MB+ on this machine) is **not** evidence of an initialised
   vault; that directory holds all of `chrome.storage.local` for the
   extension (locale, telemetry consent, feature flags, snap registries),
   which is non-empty even for a never-onboarded install. See `preflight.mjs`
   check 3's comment for the full reasoning -- this is exactly the kind of
   false-positive proxy check that made smoke-test's Step 5 permanently
   impossible, caught here before it could do the same.
2. **A disposable substitute doesn't work either.** The obvious workaround
   -- copy the installed extension's directory into a temp profile and load
   it via `--load-extension` to get a throwaway wallet without touching the
   real profile -- fails outright. Chrome's content-verification system
   rejects it: `Content verify job failed for extension: <id> at path:
   home.html and for reason:1` (hash mismatch), even with `_metadata/`
   stripped from the copy. Web-Store-installed extensions cannot be
   reloaded unpacked under their real ID on this Chrome build.

Neither blocker is something this skill's code can work around -- both are
Chrome/MetaMask platform behavior. The only path past them is a human
completing Onboarding step 3 below (importing a seed by hand), after which
a follow-up run should verify (and, if needed, correct) the unlock/connect/
confirm selectors against the real unlocked instance before relying on them
for anything unattended.

## Chrome launch contract

- `--user-data-dir=$HOME/.chrome-debug-profile` (override: `CDP_WALLET_PROFILE_DIR`)
  -- the shared debug profile. Never a throwaway one for the real run: the
  whole point is driving the same MetaMask install a human would use.
- `--remote-debugging-port=<dynamically probed, from 9222>` -- never fixed,
  so more than one Chrome (e.g. a preflight vault-check racing a real
  automation run) doesn't collide.
- No `--disable-extensions-except` (see measured unknown 1 above). Isolation
  happens post-launch via `launch.mjs`'s `isolateExtensions()`.
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

| # | Prerequisite | Scriptable? |
|---|---|---|
| 1 | `$HOME/.chrome-debug-profile` exists | Yes -- `preflight.mjs` checks it |
| 2 | MetaMask installed in that profile | Yes to check, **no** to fix -- see below |
| 3 | MetaMask vault initialised | Yes to check (a live `chrome.storage.local` read, not a directory-size guess -- see "Selector verification status" above for why), **no** to fix -- see below |
| 4 | Keychain item `stylus-demo-metamask` present | Yes -- existence check only, never reads the value |
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
2. Choose **"I already have a wallet"** and import an **existing seed
   phrase for a TESTNET-ONLY account** -- one that has never held, and will
   never hold, mainnet funds. `approveTx()` signs whatever it's pointed at
   without reading it; the only real safety boundary here is that the
   account itself has nothing worth stealing.
3. Set the vault password to the **same value** already stored in Keychain
   under `stylus-demo-metamask` (see Step 4 below), so `unlock()` can use
   it without a mismatch.
4. Fund the account with a small amount of Arbitrum Sepolia ETH from a
   faucet (see `readme.md`'s "Arbitrum Testnet Faucets" section).

**Step 4 (Keychain entry):**
```bash
security add-generic-password -s stylus-demo-metamask -a "$USER" -w
```
This prompts for the password interactively -- it is never echoed and never
touches shell history. Do **not** pass `-w <password>` as a literal
argument on the command line.

**Step 5 (Sepolia RPC):** copy `packages/stylus/.env.example` to
`packages/stylus/.env` if it doesn't exist, and fill in `RPC_URL_SEPOLIA` in
the `## sepolia` block (a public endpoint such as
`https://sepolia-rollup.arbitrum.io/rpc` works).

Every check above was verified in **both** directions where a live present
case exists: `preflight.mjs`'s output for the induced-absent case (a
non-existent profile dir, a non-existent Keychain service name, a
non-existent env file) and for the real present case (this machine's
existing profile, extension, Keychain entry) are both in this repo's PR
description / commit evidence. Check 3 (vault) could only be verified in
the absent direction on this machine, since no present case exists here --
see "Selector verification status" above.
