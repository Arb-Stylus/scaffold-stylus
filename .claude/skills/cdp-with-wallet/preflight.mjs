#!/usr/bin/env node
// .claude/skills/cdp-with-wallet/preflight.mjs
//
// Onboarding gate for the cdp-with-wallet skill. Every prerequisite here
// depends on MACHINE-LOCAL state that does not exist in the repo: a Chrome
// profile with MetaMask installed and set up, a Keychain entry, and a
// reachable Sepolia RPC. The machine this skill was designed on has all of
// it; no other machine does automatically.
//
// Same contract as smoke-test's Steps 9a/9b: a missing prerequisite SKIPs
// with the exact fix command, it never hard-fails/throws. This script only
// reads state (filesystem stats, a Keychain existence check, one RPC call);
// it never installs, imports, or writes anything.
//
// Usage:
//   node .claude/skills/cdp-with-wallet/preflight.mjs
//
// Exit codes -- three-way, not binary (adopted from scaffold-stark,
// 2026-07-22): a bare 0/1 conflates "this machine is missing a real
// prerequisite" with "the network hiccuped just now", and a gate that goes
// red on things nobody controls is a gate people learn to ignore.
//   0 - GREEN:  every prerequisite satisfied, skill is ready to run.
//   1 - RED:    at least one real, fixable prerequisite is missing (no
//       vault, no/wrong Keychain entry, MetaMask not installed, etc) --
//       see per-check SKIP lines above the summary for the exact fix. This
//       is NOT a crash, and callers SHOULD block on it.
//   2 - INFRA:  every SKIP is environmental (Sepolia RPC unreachable,
//       another Chrome window holding the debug profile) -- not a defect
//       in this machine's setup, may resolve on its own. Callers MAY choose
//       not to block on this one, e.g. retry rather than hard-fail CI.
//
// Env var overrides (for testing the absent case WITHOUT touching the real
// profile/Keychain/env file -- never delete or edit the real ones to test
// this script):
//   CDP_WALLET_PROFILE_DIR   override $HOME/.chrome-debug-profile
//   CDP_WALLET_KEYCHAIN_SERVICE  override the Keychain service name
//   CDP_WALLET_STYLUS_ENV    override packages/stylus/.env

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const METAMASK_EXTENSION_ID = "nkbihfbeogaeaoehlefnkodbefgpgknn";
const ARBITRUM_SEPOLIA_RPC_TIMEOUT_MS = 5000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const PROFILE_DIR = process.env.CDP_WALLET_PROFILE_DIR || path.join(os.homedir(), ".chrome-debug-profile");
const KEYCHAIN_SERVICE = process.env.CDP_WALLET_KEYCHAIN_SERVICE || "stylus-demo-metamask";
const STYLUS_ENV_PATH = process.env.CDP_WALLET_STYLUS_ENV || path.join(mainCheckoutRoot(), "packages", "stylus", ".env");

// MEASURED (2026-07-22): resolving packages/stylus/.env against process.cwd()
// gives a false SKIP when this skill is run from a git worktree -- .env is
// untracked, so it only exists in whichever checkout a human actually put it
// in (normally the main one), never in a worktree's own copy of the tree.
// `git rev-parse --git-common-dir` always points at the ONE shared .git dir
// for a repo, from either the main checkout or any of its worktrees; its
// parent is the main checkout's root in both cases (verified: run from the
// worktree it printed the main repo's absolute .git path, not the worktree's
// own; run from the main checkout it printed the same path either way once
// --path-format=absolute is passed).
function mainCheckoutRoot() {
  try {
    const gitCommonDir = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
      cwd: process.cwd(),
      encoding: "utf8",
    }).trim();
    return path.dirname(gitCommonDir);
  } catch {
    // Not inside a git repo (or git missing) -- fall back to cwd, same as
    // the previous behavior, rather than crashing the whole preflight run.
    return process.cwd();
  }
}

// Three-way exit classification (adopted from scaffold-stark, 2026-07-22):
// a SKIP is not one thing. "No vault initialised" and "Sepolia RPC
// unreachable" look identical as a bare exit(1) -- but the first is a real,
// fixable machine-setup gap (RED) and the second may just be a transient
// network blip or someone else's Chrome window (INFRA). Collapsing them into
// one exit code means a caller either blocks on both (and learns to ignore
// the gate when infra flakes) or blocks on neither (and misses a genuine
// setup problem). category defaults to "RED" -- only the specific checks
// that are about environment/timing rather than this machine's own
// configuration pass "INFRA" explicitly.
const results = []; // { name, status: "OK"|"SKIP", detail, fix, category }
function record(name, status, detail, fix, category = "RED") {
  results.push({ name, status, detail, fix, category });
  const line = `[${status}] ${name} -- ${detail}`;
  console.log(line);
  if (status === "SKIP") console.log(`  fix: ${fix}`);
}

// withChromeOnRealProfile() throws one specific, named error for "someone
// else's Chrome is currently holding this profile" (see its own comment) --
// that's a transient state a human closing a window fixes, not a machine
// mis-setup, so it gets INFRA rather than RED. Every other failure out of
// that helper (Chrome crashed, CDP never came up for an unknown reason,
// extension never registered a service worker) stays RED: those indicate
// something is actually broken about this machine's Chrome/extension setup,
// not just bad timing.
function categoryForChromeError(err) {
  return /already using this profile/.test(err.message) ? "INFRA" : "RED";
}

// ---------------------------------------------------------------------------
// 1. Chrome debug profile directory
// ---------------------------------------------------------------------------
function checkProfileDir() {
  const name = "Chrome debug profile directory";
  if (fs.existsSync(PROFILE_DIR) && fs.statSync(PROFILE_DIR).isDirectory()) {
    record(name, "OK", PROFILE_DIR);
    return true;
  }
  record(
    name,
    "SKIP",
    `${PROFILE_DIR} does not exist`,
    `Launch Chrome once with that profile to create it, e.g.: ` +
      `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --user-data-dir="${PROFILE_DIR}" ` +
      `-- then close it and continue to Onboarding step 2 in SKILL.md.`,
  );
  return false;
}

// ---------------------------------------------------------------------------
// 2. MetaMask installed in that profile
// ---------------------------------------------------------------------------
function checkMetaMaskInstalled() {
  const name = "MetaMask installed in the debug profile";
  const extDir = path.join(PROFILE_DIR, "Default", "Extensions", METAMASK_EXTENSION_ID);
  if (!fs.existsSync(extDir)) {
    record(
      name,
      "SKIP",
      `no ${METAMASK_EXTENSION_ID} directory under ${extDir}`,
      `Open Chrome with --user-data-dir="${PROFILE_DIR}", go to the MetaMask Chrome Web Store ` +
        `page, and click "Add to Chrome". See SKILL.md Onboarding step 2.`,
    );
    return false;
  }
  const versions = fs.readdirSync(extDir).filter(name => fs.statSync(path.join(extDir, name)).isDirectory());
  if (!versions.length) {
    record(name, "SKIP", `${extDir} exists but has no version subdirectory`, `Reinstall MetaMask -- see SKILL.md Onboarding step 2.`);
    return false;
  }
  const version = versions.sort().at(-1);
  record(name, "OK", `version ${version.replace(/_0$/, "")} found at ${extDir}`);
  return true;
}

// ---------------------------------------------------------------------------
// 3. MetaMask vault initialised
// ---------------------------------------------------------------------------
//
// IMPORTANT (measured 2026-07-22): a non-empty
// "Local Extension Settings/<id>" directory is NOT sufficient evidence that
// a vault exists. That directory holds ALL of chrome.storage.local for the
// extension -- locale, telemetry consent, feature flags, snap registries --
// which is non-empty for a freshly-installed, never-onboarded extension too.
// On the machine this skill was designed on, that directory is >9MB and
// non-empty, yet a live check (KeyringController.vault via a real Chrome +
// CDP session) showed no vault and zero accounts -- MetaMask's own UI
// confirms this by redirecting home.html to #/onboarding/welcome instead of
// an unlock screen. A directory-size check would have reported this
// prerequisite as satisfied when it was not: exactly the false-positive this
// check exists to avoid. So this check does not just stat a directory --
// it launches a short-lived headless Chrome, opens the extension's own
// service worker, and reads chrome.storage.local directly.
async function checkVaultInitialised() {
  const name = "MetaMask vault initialised";
  const extDir = path.join(PROFILE_DIR, "Default", "Extensions", METAMASK_EXTENSION_ID);
  if (!fs.existsSync(extDir)) {
    record(name, "SKIP", "MetaMask is not installed (see prerequisite 2 above)", "Complete prerequisite 2 first.");
    return false;
  }

  const fixMsg =
    "Open Chrome with --user-data-dir pointed at the debug profile, open the MetaMask extension, " +
    "and complete setup by IMPORTING AN EXISTING SEED PHRASE for a TESTNET-ONLY account " +
    "(never one holding mainnet funds -- this skill signs transactions without reading their contents). " +
    "See SKILL.md Onboarding step 3.";

  let vaultState;
  try {
    vaultState = await readVaultStateViaCdp();
  } catch (err) {
    // Any failure here (Chrome missing, CDP never came up, extension never
    // registered a service worker) is reported as SKIP with the raw error --
    // this check must never crash the whole preflight run.
    record(name, "SKIP", `could not verify live (${err.message})`, fixMsg, categoryForChromeError(err));
    return false;
  }

  if (!vaultState.hasVault || vaultState.accountCount === 0) {
    record(
      name,
      "SKIP",
      `no vault / zero accounts in chrome.storage.local (hasVault=${vaultState.hasVault}, accounts=${vaultState.accountCount}, completedOnboarding=${vaultState.completedOnboarding})`,
      fixMsg,
    );
    return false;
  }
  record(name, "OK", `vault present, ${vaultState.accountCount} account(s), completedOnboarding=${vaultState.completedOnboarding}`);
  return true;
}

// MEASURED (2026-07-22): Chrome only allows one process to hold a given
// --user-data-dir at a time. If a human already has that profile open
// (their normal interactive browsing session, no --remote-debugging-port),
// launching a second Chrome against it never gets a CDP port up -- it just
// times out. Without this check, that surfaces as
// "Chrome's CDP endpoint never became reachable (fetch failed)", which
// reads like a broken launcher or a network problem, and sends the next
// person hunting for a bug that isn't there. This is the same failure
// shape smoke-test hit before: Step 9c's balance gate misdiagnosed a
// missing `cast` binary as "Sepolia RPC unreachable" -- right symptom,
// wrong cause. Detecting the actual conflicting process up front and
// naming its PID is the fix, same as here.
function findChromeUsingProfile(profileDir) {
  let psOutput;
  try {
    psOutput = execFileSync("ps", ["-ax", "-o", "pid=,command="], { encoding: "utf8" });
  } catch {
    return null; // ps itself failing is not this check's problem to diagnose
  }
  for (const line of psOutput.split("\n")) {
    // Match the main browser binary specifically (trailing space excludes
    // "Google Chrome Helper" et al, which also carry --user-data-dir).
    if (!line.includes("Contents/MacOS/Google Chrome ")) continue;
    if (!line.includes(`--user-data-dir=${profileDir}`)) continue;
    const match = line.trim().match(/^(\d+)\s/);
    if (match) return { pid: match[1], command: line.trim() };
  }
  return null;
}

// Shared by both the vault-read check and the live-unlock check below --
// both need a Chrome process against the REAL profile, both need the same
// conflicting-process guard, both must always kill what they launched.
async function withChromeOnRealProfile(callback) {
  const { launchChrome, findFreePort, waitForCdpReady, killChromeGroup } = await import("./launch.mjs");

  const conflict = findChromeUsingProfile(PROFILE_DIR);
  if (conflict) {
    throw new Error(
      `another Chrome is already using this profile (PID ${conflict.pid}) -- quit it with Cmd+Q ` +
        `(not just closing the window) and re-run`,
    );
  }

  const port = await findFreePort(9222);
  // A throwaway profile pointed at a COPY of this profile's on-disk
  // extension would trip Chrome's content-verification (see SKILL.md
  // "Measured unknowns" -- loading a Web-Store-installed extension's
  // directory via --load-extension fails content_verify_job with a hash
  // mismatch, even with _metadata stripped). So these checks do not
  // copy/relaunch the extension standalone; they open the REAL profile
  // directly -- Chrome permits only one process to hold a given
  // user-data-dir at a time, so this must not be run concurrently with a
  // real automation session against the same profile.
  const chrome = launchChrome({ port, userDataDir: PROFILE_DIR, headless: true });
  try {
    // If the timeout below fires, it means CDP genuinely never came up for
    // some OTHER reason (Chrome crashed, a firewall rule, etc) -- the
    // conflicting-process case is already ruled out above, so that timeout
    // message stays generic and the two causes stay distinguishable.
    await waitForCdpReady(port, 15000);
    return await callback(port);
  } finally {
    await killChromeGroup(chrome.pid);
  }
}

async function readVaultStateViaCdp() {
  const { CDP } = await import("./launch.mjs");
  return withChromeOnRealProfile(async port => {
    const target = await waitForServiceWorker(port, METAMASK_EXTENSION_ID, 10000);
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", () => resolve(), { once: true });
      ws.addEventListener("error", e => reject(new Error(`WebSocket connect failed: ${e.message}`)), { once: true });
    });
    const cdp = new CDP(ws);
    await cdp.send("Runtime.enable");

    // MEASURED (2026-07-22): the service_worker target appears in /json/list
    // slightly before the worker's top-level script has finished registering
    // `chrome.storage` -- an evaluate() fired immediately on attach throws
    // "Cannot read properties of undefined (reading 'local')". Retrying a
    // few times a short distance apart clears it; there is no CDP event to
    // wait on instead (the worker doesn't fire one for "APIs are bound").
    let result;
    let lastErr;
    for (let attempt = 0; attempt < 8; attempt++) {
      result = await cdp.send("Runtime.evaluate", {
        expression: `
          typeof chrome === "undefined" || typeof chrome.storage === "undefined"
            ? Promise.reject(new Error("chrome.storage not yet bound"))
            : new Promise((resolve) => {
                chrome.storage.local.get(["KeyringController", "OnboardingController", "AccountsController"], (items) => {
                  resolve({
                    hasVault: !!(items.KeyringController && items.KeyringController.vault),
                    accountCount: items.AccountsController && items.AccountsController.internalAccounts
                      ? Object.keys(items.AccountsController.internalAccounts.accounts || {}).length
                      : 0,
                    completedOnboarding: !!(items.OnboardingController && items.OnboardingController.completedOnboarding),
                  });
                });
              })
        `,
        awaitPromise: true,
        returnByValue: true,
      });
      if (!result.exceptionDetails) break;
      lastErr = result.exceptionDetails.exception?.description || JSON.stringify(result.exceptionDetails);
      await sleep(400);
    }
    ws.close();
    if (!result || result.exceptionDetails) {
      throw new Error(`chrome.storage never became available on the service worker: ${lastErr}`);
    }
    return result.result.value;
  });
}

async function waitForServiceWorker(port, extensionId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const list = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
    const target = list.find(t => t.type === "service_worker" && t.url.includes(extensionId));
    if (target) return target;
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error(`MetaMask service worker never appeared within ${timeoutMs}ms`);
}

// ---------------------------------------------------------------------------
// 4. Keychain entry present AND correct
// ---------------------------------------------------------------------------
//
// MEASURED (2026-07-22): an existence-only check is not enough. On this
// machine the Keychain item existed (created earlier in the session) but
// held a DIFFERENT value than the password actually set during MetaMask
// onboarding (set later, at a different moment) -- preflight reported OK,
// and unlock() failed several steps downstream with a confusing
// "MetaMask rejected the password" error. That is the exact same failure
// shape as check 3's "non-empty directory != initialised vault": a cheap
// proxy that looks like it proves the real thing but doesn't. The fix here
// is the same kind -- verify the password actually WORKS by attempting a
// real unlock, not just that some value is stored under that name.
//
// This needs prerequisite 3 (vault initialised) to have already passed --
// there is nothing to unlock otherwise -- so `vaultOk` gates the live
// attempt; call this AFTER checkVaultInitialised(), passing its result.
async function checkKeychainEntry(vaultOk) {
  const name = "Keychain entry present and correct";
  let password;
  try {
    // Read in-process via execFileSync -- never through a shell command
    // substitution passed as an argv (that would land the password in `ps`
    // output for the life of the process) and never printed/logged, only
    // its length ever appears below.
    password = execFileSync("security", ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"], { encoding: "utf8" }).trim();
  } catch {
    record(
      name,
      "SKIP",
      `no Keychain item named "${KEYCHAIN_SERVICE}"`,
      `security add-generic-password -s ${KEYCHAIN_SERVICE} -a "$USER" -w  ` +
        `(this prompts for the password interactively -- it is never echoed and never touches shell history; ` +
        `do NOT pass -w <password> as a literal argument).`,
    );
    return false;
  }

  if (!vaultOk) {
    // Nothing to unlock yet -- fall back to existence-only, same as the
    // previous behavior, rather than blocking on prerequisite 3's own SKIP.
    record(name, "OK", `entry present (length ${password.length}) -- vault not initialised yet, so password correctness could not be verified (see prerequisite 3)`);
    return true;
  }

  const { unlock, IncorrectPasswordError } = await import("./metamask.mjs");
  try {
    const result = await withChromeOnRealProfile(port => unlock({ port, extensionId: METAMASK_EXTENSION_ID, password }));
    record(name, "OK", `entry present (length ${password.length}) and successfully unlocked the vault (alreadyUnlocked=${result.alreadyUnlocked})`);
    return true;
  } catch (err) {
    if (err instanceof IncorrectPasswordError) {
      record(
        name,
        "SKIP",
        `entry present (length ${password.length}) but MetaMask rejected it -- the stored value does not match this vault's actual password`,
        `security add-generic-password -U -s ${KEYCHAIN_SERVICE} -a "$USER" -w  ` +
          `(the -U flag updates the existing item; set it to the SAME password you use to unlock MetaMask by hand). ` +
          `This drifts because the two are set at different moments -- the Keychain entry when this machine was first ` +
          `provisioned, the MetaMask password later during onboarding -- so nothing keeps them in sync automatically.`,
      );
    } else {
      record(
        name,
        "SKIP",
        `could not verify live (${err.message})`,
        `Investigate the error above; this is not a missing-prerequisite case.`,
        categoryForChromeError(err),
      );
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// 5. Arbitrum Sepolia RPC reachable via packages/stylus/.env
// ---------------------------------------------------------------------------
async function checkSepoliaRpc() {
  const name = "Arbitrum Sepolia RPC reachable";
  const fixMsg =
    `cp packages/stylus/.env.example packages/stylus/.env (if it doesn't exist yet), then fill in ` +
    `RPC_URL_SEPOLIA in the "## sepolia" block. A public endpoint (e.g. https://sepolia-rollup.arbitrum.io/rpc) works.`;

  if (!fs.existsSync(STYLUS_ENV_PATH)) {
    record(name, "SKIP", `${STYLUS_ENV_PATH} does not exist`, fixMsg);
    return false;
  }
  const envText = fs.readFileSync(STYLUS_ENV_PATH, "utf8");
  const match = envText.match(/^RPC_URL_SEPOLIA=(.+)$/m);
  const rpcUrl = match ? match[1].trim() : "";
  if (!rpcUrl) {
    record(name, "SKIP", `${STYLUS_ENV_PATH} exists but RPC_URL_SEPOLIA is blank/absent`, fixMsg);
    return false;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ARBITRUM_SEPOLIA_RPC_TIMEOUT_MS);
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const body = await res.json();
    const chainId = body.result;
    if (chainId !== "0x66eee") {
      record(name, "SKIP", `RPC responded but chainId ${chainId} != Arbitrum Sepolia's 0x66eee`, `Point RPC_URL_SEPOLIA at an Arbitrum Sepolia endpoint.`);
      return false;
    }
    record(name, "OK", `${rpcUrl} reachable, chainId=0x66eee`);
    return true;
  } catch (err) {
    // Unreachable is the canonical INFRA case: a transient network blip, a
    // rate limit, or the public endpoint being temporarily down are not
    // this machine's fault and often resolve on their own -- unlike a wrong
    // chainId or a blank .env value above, which are real misconfiguration
    // (RED, the default).
    record(name, "SKIP", `RPC_URL_SEPOLIA set but unreachable (${err.message})`, `Check connectivity / the URL itself. ${fixMsg}`, "INFRA");
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("=== cdp-with-wallet preflight ===");
  console.log(`Profile dir: ${PROFILE_DIR}`);
  console.log("");

  checkProfileDir();
  checkMetaMaskInstalled();
  const vaultOk = await checkVaultInitialised();
  await checkKeychainEntry(vaultOk);
  await checkSepoliaRpc();

  console.log("");
  const skipped = results.filter(r => r.status === "SKIP");
  const redSkips = skipped.filter(r => r.category === "RED");
  const infraSkips = skipped.filter(r => r.category === "INFRA");

  if (!skipped.length) {
    console.log(`READY (exit 0): all ${results.length} prerequisites satisfied.`);
    process.exit(0);
  }
  if (redSkips.length) {
    // RED wins even if INFRA skips are ALSO present -- a real setup gap
    // needs fixing regardless of what else happened to be flaky this run.
    console.log(
      `NOT READY (exit 1, RED): ${redSkips.length} real problem(s) to fix` +
        (infraSkips.length ? ` (plus ${infraSkips.length} environmental issue(s), see below)` : "") +
        ` -- see SKIP lines above for exact fixes.`,
    );
    process.exit(1);
  }
  console.log(
    `NOT READY (exit 2, INFRA): ${infraSkips.length} environmental issue(s) -- not a code or config defect on this ` +
      `machine, may resolve on retry (network blip, another Chrome window, rate limit). Callers may choose not to ` +
      `block on this exit code.`,
  );
  process.exit(2);
}

main();
