#!/usr/bin/env node
// .claude/skills/cdp-with-wallet/launch.mjs
//
// Chrome launcher for the cdp-with-wallet skill -- profile handling,
// dynamic-port CDP, single-wallet extension isolation, and PID process
// hygiene. Raw Chrome DevTools Protocol over WebSocket, zero npm
// dependencies, matching the in-repo precedent
// .claude/skills/smoke-test/browser-e2e.mjs (same CDP client shape, same
// findFreePort/waitForCdpReady idiom).
//
// MEASURED, not assumed (2026-07-22): --disable-extensions-except does NOT
// selectively keep an installed (Web-Store) extension enabled in this Chrome
// build (150.x). Tried both an installed-extension directory path and a bare
// extension ID -- both disabled EVERY extension, including the one named,
// confirmed via chrome.developerPrivate.getExtensionsInfo() showing an empty
// list either way. That flag's allow-listing mechanism only recognizes
// extensions loaded via --load-extension (unpacked/dev-mode); it does not
// match extensions installed from the Web Store, so passing it a path/ID for
// one is equivalent to just disabling everything. The verified working
// alternative below is what SKILL.md's isolation contract actually relies
// on: after CDP is up, open a chrome://extensions tab and call
// chrome.management.setEnabled(id, false) directly -- that API IS available,
// unrestricted, from a chrome://extensions page's own JS context, and does
// not require Developer Mode to be toggled on for Web-Store-installed
// (non-unpacked) extensions.
//
// CLI usage (process hygiene escape hatch, mirrors smoke-test's teardown.sh):
//   node launch.mjs list      -- print the PID registry (after pruning dead PIDs)
//   node launch.mjs teardown  -- kill every live Chrome in the registry, clear it
//
// Library usage (imported by preflight.mjs and metamask.mjs):
//   import { launchChrome, findFreePort, waitForCdpReady, CDP,
//            killChromeGroup, isolateExtensions, restoreExtensions } from "./launch.mjs"

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export class EnvironmentError extends Error {}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export const METAMASK_EXTENSION_ID = "nkbihfbeogaeaoehlefnkodbefgpgknn";

// ---------------------------------------------------------------------------
// PID registry -- array with dead-PID pruning, not a single record.
//
// The smoke-test skill's state.mjs (the in-repo precedent for "durable record
// of a launched process") stores ONE PID per key, which is safe there
// because Step 7's Chrome always binds a fixed, freshly-probed port for the
// life of that one script. This skill's Chrome port is ALSO dynamically
// probed, but unlike smoke-test, cdp-with-wallet is meant to be invoked
// repeatedly and can legitimately have more than one Chrome instance
// in flight (e.g. a preflight vault-check launch racing a real automation
// launch) -- a single-record store would silently overwrite an earlier
// still-alive entry and lose track of it. That is precisely how the Chrome
// orphan on 2026-07-21 survived five hours undetected: a PID was only ever
// recorded on the FAILURE path, one at a time, so a second concurrent
// success/failure clobbered the first record entirely. This registry is an
// array, and every entry is written synchronously at spawn time --
// before waitForCdpReady, before anything that can throw -- so a crash
// between spawn and readiness still leaves a recoverable trace.
// ---------------------------------------------------------------------------

const REGISTRY_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), ".cdp-wallet-state.json");

function readRegistry() {
  try {
    const parsed = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRegistry(entries) {
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(entries, null, 2) + "\n");
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// Drops entries whose PID is no longer running. Called on every read/write
// so the registry never accumulates stale rows from processes that were
// killed by some other means (e.g. `kill` by hand, a reboot).
function pruneDead(entries) {
  return entries.filter(e => isPidAlive(e.pid));
}

// Synchronous append -- called immediately after spawn(), before any await,
// per the process-hygiene invariant above.
function recordSpawn(entry) {
  const entries = pruneDead(readRegistry());
  entries.push(entry);
  writeRegistry(entries);
}

function removeEntry(pid) {
  writeRegistry(pruneDead(readRegistry()).filter(e => e.pid !== pid));
}

// Same synchronous-write discipline as recordSpawn(), for the OTHER piece of
// state that must survive a crash: which extensions this run disabled.
// MEASURED (2026-07-22): running isolateExtensions() twice without an
// intervening restoreExtensions() silently disables zero NEW extensions on
// the second run, because its filter only targets currently-ENABLED,
// non-MetaMask extensions -- ones a prior crashed run already disabled are
// invisible to it, so they can never come back via that run's own return
// value. Without this record, a crash between isolate and restore leaves
// the developer's other wallets/extensions disabled with no trace of why --
// the exact same failure shape as the Chrome-PID orphan this registry
// already exists to prevent, just for extensions instead of processes.
function recordIsolation(pid, disabledExtensionIds) {
  const entries = pruneDead(readRegistry());
  const entry = entries.find(e => e.pid === pid);
  if (entry) entry.disabledExtensionIds = disabledExtensionIds;
  writeRegistry(entries);
}

export function listRegistry() {
  const live = pruneDead(readRegistry());
  writeRegistry(live); // persist the pruning itself, not just the read
  return live;
}

// ---------------------------------------------------------------------------
// Chrome discovery + launch
// ---------------------------------------------------------------------------

export function findChromeBinary() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new EnvironmentError(`No Chrome/Chromium binary found (checked: ${candidates.join(", ")}; override with CHROME_PATH)`);
}

export async function findFreePort(startPort, attempts = 20) {
  const net = await import("node:net");
  for (let offset = 0; offset < attempts; offset++) {
    const candidate = startPort + offset;
    const free = await new Promise(resolve => {
      const server = net.createServer();
      server.once("error", () => resolve(false));
      server.listen(candidate, "127.0.0.1", () => server.close(() => resolve(true)));
    });
    if (free) return candidate;
  }
  throw new EnvironmentError(`No free debugging port found in range ${startPort}-${startPort + attempts - 1}`);
}

export async function waitForCdpReady(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return res.json();
    } catch (err) {
      lastError = err;
    }
    await sleep(200);
  }
  throw new EnvironmentError(`Chrome's CDP endpoint on port ${port} never became reachable within ${timeoutMs}ms (last error: ${lastError?.message})`);
}

// Launches Chrome against `userDataDir` (the real debug profile, or a
// temp/override one for testing) with CDP on `port`. Deliberately does NOT
// pass --disable-extensions-except -- see the file header for why that flag
// doesn't do what it looks like it does. Single-wallet isolation happens
// AFTER launch via isolateExtensions(), once CDP is up.
//
// Defaults to headless -- MEASURED (2026-07-22), not assumed: `--headless=new`
// (Chrome's newer headless mode, unlike the old one) runs extensions, which
// is exactly why MetaMask is drivable at all without a visible window. Proof
// is this skill's own preflight.mjs: its vault/password checks read
// chrome.storage.local out of MetaMask's service worker, and drove a real
// unlock()/connect()/wallet_addEthereumChain/eth_sendTransaction chain to a
// mined Arbitrum Sepolia transaction, entirely with headless: true. A
// visible window stealing focus for routine automation is a real cost, not
// a neutral default -- so callers that just want automation get the
// non-disruptive behavior without needing to know this flag exists.
//
// Recording the browser for a demo video does NOT require headless: false.
// The initial demo-video design (PR 2) assumed macOS `screencapture -v` --
// which does need a real, visible window -- but that path hit a real macOS
// Screen Recording TCC permission gate mid-build. It was replaced with CDP's
// own Page.startScreencast, which captures frames from inside Chrome
// (works headless, needs no OS permission, and works in CI). See
// .claude/skills/demo-video/SKILL.md for the frame-timing details.
export function launchChrome({ port, userDataDir, headless = true }) {
  const bin = findChromeBinary();
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    // Recent Chrome 403s a same-machine, non-browser WebSocket client on the
    // CDP upgrade unless the Host/Origin is explicitly allowed.
    "--remote-allow-origins=*",
  ];
  if (headless) args.push("--headless=new");

  const child = spawn(bin, args, { detached: true, stdio: "ignore" });
  child.unref();

  // Record synchronously, before waitForCdpReady or anything else that can
  // throw -- see the registry section above for why this ordering is the
  // whole point.
  recordSpawn({ pid: child.pid, port, userDataDir, startedAt: new Date().toISOString(), headless });

  return { pid: child.pid, port, userDataDir };
}

export async function killChromeGroup(pid) {
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    /* already gone */
  }
  await sleep(1000);
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    /* already gone */
  }
  removeEntry(pid);
}

// ---------------------------------------------------------------------------
// Minimal CDP client (JSON-RPC over the native WebSocket) -- same shape as
// smoke-test/browser-e2e.mjs's CDP class.
// ---------------------------------------------------------------------------

export class CDP {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.eventListeners = new Map();
    ws.addEventListener("message", event => {
      const msg = JSON.parse(event.data);
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`CDP error (${msg.error.code}): ${msg.error.message}`));
        else resolve(msg.result);
      } else if (msg.method && this.eventListeners.has(msg.method)) {
        for (const handler of this.eventListeners.get(msg.method)) handler(msg.params);
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  // Persistent listener for events that fire repeatedly (e.g.
  // Page.screencastFrame) -- unlike once(), the handler is never
  // auto-removed. Returns an unsubscribe function.
  on(method, handler) {
    if (!this.eventListeners.has(method)) this.eventListeners.set(method, new Set());
    const set = this.eventListeners.get(method);
    set.add(handler);
    return () => set.delete(handler);
  }

  once(method, timeoutMs, description = method) {
    return new Promise((resolve, reject) => {
      if (!this.eventListeners.has(method)) this.eventListeners.set(method, new Set());
      const set = this.eventListeners.get(method);
      const timer = setTimeout(() => {
        set.delete(handler);
        reject(new EnvironmentError(`Timed out after ${timeoutMs}ms waiting for CDP event: ${description}`));
      }, timeoutMs);
      const handler = params => {
        clearTimeout(timer);
        set.delete(handler);
        resolve(params);
      };
      set.add(handler);
    });
  }
}

export async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) {
    const desc = result.exceptionDetails.exception?.description || JSON.stringify(result.exceptionDetails);
    throw new Error(`Runtime.evaluate threw: ${desc}`);
  }
  return result.result?.value;
}

async function openTab(port, url) {
  const res = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  if (!res.ok) throw new EnvironmentError(`PUT /json/new failed with HTTP ${res.status}`);
  return res.json();
}

async function attachCdp(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener("error", err => reject(new EnvironmentError(`WebSocket connect failed: ${err.message}`)), { once: true });
  });
  const cdp = new CDP(ws);
  await cdp.send("Runtime.enable");
  return { cdp, ws };
}

// ---------------------------------------------------------------------------
// Single-wallet extension isolation
//
// The debug profile also holds four other wallets (Braavos, Keplr, Xverse,
// and the "Ready X" smart wallet) plus an "Allow CORS" extension. All of the
// Ethereum-announcing ones broadcast via EIP-6963, so leaving them enabled
// makes the dapp's connector list non-deterministic; the CORS extension
// would make any recording unrepresentative of what a real user sees. See
// the file header for why --disable-extensions-except can't do this.
// ---------------------------------------------------------------------------

// Disables every extension except `keepId` via chrome.management, returns
// the list of extension IDs it disabled (for restoreExtensions() to reverse)
// plus the ID of the helper tab it opened, so the caller can close it. `pid`
// is the Chrome PID from launchChrome() -- passing it lets this function
// persist the disabled-list into that PID's registry entry synchronously
// (see recordIsolation() above), so a crash before restoreExtensions() runs
// still leaves a recoverable trace, the same invariant applied to PIDs
// themselves.
export async function isolateExtensions(port, keepId = METAMASK_EXTENSION_ID, pid = null) {
  const tab = await openTab(port, "chrome://extensions/");
  const { cdp, ws } = await attachCdp(tab);
  try {
    const disabledIds = await evaluate(
      cdp,
      `(async () => {
        const list = await new Promise((resolve) => chrome.management.getAll(resolve));
        const toDisable = list.filter(e => e.id !== ${JSON.stringify(keepId)} && e.type === "extension" && e.enabled);
        const disabled = [];
        for (const e of toDisable) {
          await new Promise((resolve, reject) => {
            chrome.management.setEnabled(e.id, false, () => {
              if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
              else resolve();
            });
          });
          disabled.push(e.id);
        }
        return disabled;
      })()`,
    );
    if (pid !== null) recordIsolation(pid, disabledIds);
    return { disabledIds, tabId: tab.id };
  } finally {
    ws.close();
    await fetch(`http://127.0.0.1:${port}/json/close/${tab.id}`).catch(() => {});
  }
}

// Re-enables every extension isolateExtensions() disabled. This MUST run on
// every exit path (pass, fail, crash) -- the debug profile is the developer's
// real, persistent Chrome profile, not a throwaway one, so leaving other
// wallets disabled after a run would silently modify their environment.
// `pid`, if passed, clears the isolation record on success so a later
// teardown doesn't try to restore an already-restored list.
export async function restoreExtensions(port, disabledIds, pid = null) {
  if (!disabledIds?.length) return;
  const tab = await openTab(port, "chrome://extensions/");
  const { cdp, ws } = await attachCdp(tab);
  try {
    await evaluate(
      cdp,
      `(async () => {
        for (const id of ${JSON.stringify(disabledIds)}) {
          await new Promise((resolve) => chrome.management.setEnabled(id, true, () => resolve()));
        }
      })()`,
    );
    if (pid !== null) recordIsolation(pid, []);
  } finally {
    ws.close();
    await fetch(`http://127.0.0.1:${port}/json/close/${tab.id}`).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// CLI (process-hygiene escape hatch)
// ---------------------------------------------------------------------------

async function main() {
  const [, , cmd] = process.argv;
  switch (cmd) {
    case "list": {
      const live = listRegistry();
      console.log(JSON.stringify(live, null, 2));
      break;
    }
    case "teardown": {
      const live = listRegistry();
      if (!live.length) {
        console.log("No live Chrome instances in the registry.");
        break;
      }
      for (const entry of live) {
        if (entry.disabledExtensionIds?.length) {
          console.log(`Restoring ${entry.disabledExtensionIds.length} extension(s) disabled by PID ${entry.pid} before killing it`);
          await restoreExtensions(entry.port, entry.disabledExtensionIds, entry.pid).catch(err =>
            console.error(`  could not restore extensions (Chrome may already be unresponsive): ${err.message}`),
          );
        }
        console.log(`Killing PID ${entry.pid} (port ${entry.port}, profile ${entry.userDataDir})`);
        await killChromeGroup(entry.pid);
      }
      console.log("Done.");
      break;
    }
    default:
      console.error("usage: launch.mjs <list|teardown>");
      process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
