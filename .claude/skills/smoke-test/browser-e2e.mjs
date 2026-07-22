#!/usr/bin/env node
// .claude/skills/smoke-test/browser-e2e.mjs
//
// Step 7 (Browser E2E) of the smoke-test skill, driven by pure Chrome
// DevTools Protocol -- zero new dependencies. Node 24 ships a native
// `WebSocket` and `fetch`, which is the whole CDP transport; no puppeteer,
// playwright, chrome-remote-interface, or ws. This repo is a template
// inherited by every fork and by `create-stylus`, so that constraint is not
// negotiable.
//
// Replaces driving the browser through the claude.ai/chrome MCP extension,
// which needs a human-attached browser, cannot run in CI, and is not
// reproducible.
//
// Usage:
//   FRONTEND_PORT=<port> node .claude/skills/smoke-test/browser-e2e.mjs
//
// Env vars:
//   FRONTEND_PORT     required -- port Step 6's `next dev` is listening on
//   CHROME_PATH       optional -- override Chrome binary discovery
//   SMOKE_TEST_HEADFUL=1  optional -- run Chrome with a visible window
//                     (default is headless, since reproducibility in CI is
//                     the whole point of this rewrite)
//
// Exit codes (mirrors the skill's tri-state reporting):
//   0 -- RAN and passed (a)
//   1 -- DID NOT RUN (b) -- environment/tooling problem: Chrome missing, no
//        free debugging port, CDP never came up, page never loaded
//   2 -- RAN and failed (c) -- an assertion did not hold: wallet wouldn't
//        connect, write tx never confirmed, read-back mismatch, block
//        explorer pagination showed a duplicate/blank row
//
// On a PASS this script kills its own Chrome and removes its temp profile
// dir. On anything else, it leaves Chrome running (same policy as Step 8)
// and records its PID/debug port/profile dir in the shared state file
// (state.mjs) so teardown.sh's escape hatch can find and clean it up later.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { setState, unsetState } from "./state.mjs";

class EnvironmentError extends Error {}
class AssertionFailure extends Error {}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function log(msg) {
  console.log(`[browser-e2e] ${msg}`);
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const FRONTEND_PORT = process.env.FRONTEND_PORT;
if (!FRONTEND_PORT) {
  console.error("FRONTEND_PORT is required (the port Step 6's next dev is listening on)");
  process.exit(1);
}
const FRONTEND_BASE = `http://localhost:${FRONTEND_PORT}`;
const RPC_URL = "http://127.0.0.1:8547";
// Well-known nitro-devnode prefunded dev accounts -- see SKILL.md Step 1b
// and packages/nextjs/utils/scaffold-stylus/supportedChains.ts. Not secrets.
const MINER_PRIVATE_KEY = "0xb6b15c8cb491557369f3c7d2c287b053eb229daa9c22138887752191c9520659";
const MINER_TO_ADDRESS = "0xDD09b55496EaA3cFAe23137ABDeA52a9a979B70e";

const HEADLESS = process.env.SMOKE_TEST_HEADFUL !== "1";
const ARTIFACT_DIR = path.join(os.tmpdir(), "smoke-test-artifacts");
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Dev-overlay / console advisory -- ADVISORY ONLY, see printDevOverlayAdvisory
// ---------------------------------------------------------------------------
//
// The Next.js dev overlay's error badge and the browser console are not
// checked by any assertion above -- a run can pass every assertion while the
// app is quietly reporting a problem via the overlay. This section collects
// console/runtime events and the overlay's own DOM state for the whole
// session and reports them prominently, but a match here NEVER changes the
// PASS/FAIL/INCONCLUSIVE verdict: some of these come from third-party code
// or third-party services this repo doesn't control, and a gate nobody can
// satisfy is a gate people learn to route around.
//
// To keep a silent "1 issue" from drifting to 3 unnoticed, every observed
// issue is matched against this known-issues baseline by a short, stable
// substring (never a full stack trace -- line numbers churn on every
// dependency bump). Add an entry here, dated, with a one-line reason, once a
// human has actually looked at a NEW issue and decided it's acceptable.
//
// Signature rule: match on something that identifies the CODEPATH (a calling
// hook/component name, or an application-level error-message prefix), never
// on a bare third-party hostname by itself. A shared host like a public RPC
// or a demo API key can be hit by more than one unrelated feature; a bare-
// host match silently absorbs every future codepath that happens to hit the
// same host under one old, unrelated "accepted" reason, and a regression in
// a brand-new feature would then read as KNOWN instead of NEW. Case in
// point: an earlier version of this baseline matched bare "eth.merkle.io" /
// the shared Alchemy demo key host, accepted as a price-fetch fallback --
// then a completely unrelated ENS lookup (Address.tsx) started hitting the
// exact same hosts and matched right through it, unnoticed, until the price
// feature that "explained" the entry was deleted.
const KNOWN_OVERLAY_ISSUES = [
  {
    match: "Encountered a script tag while rendering React component",
    acceptedDate: "2026-07-21",
    reason:
      "Third-party: next-themes@0.4.6's ThemeProvider renders an internal <script> tag " +
      "to set the theme attribute before hydration (its no-flash-of-wrong-theme trick). " +
      "React's dev-mode console warns about seeing a <script> element mid-render, but the " +
      "script still runs correctly pre-hydration -- dev-only, no production impact. This IS " +
      "the dev-overlay's error badge (its only entry). Confirmed pre-existing on origin/main " +
      "(identical ThemeProvider.tsx/layout.tsx and next-themes/next versions); not caused by " +
      "any change on this branch.",
  },
  {
    match: "Lit is in dev mode",
    acceptedDate: "2026-07-21",
    reason:
      "Third-party: @reown/appkit-ui and @reown/appkit-scaffold-ui (WalletConnect's wallet " +
      "modal UI, pulled in transitively via RainbowKit) build on the `lit` web-components " +
      "library, which logs this notice whenever it isn't built in production mode -- a dev- " +
      "only self-check with no production impact. Does not appear in the dev-overlay badge, " +
      "console warning only.",
  },
];

function matchBaseline(signature) {
  return KNOWN_OVERLAY_ISSUES.find(known => signature.includes(known.match));
}

// First line only, dependency-version/address noise stripped, so the
// signature is what a human would recognize as "the same error" even after
// unrelated line-number or hex-value churn.
function normalizeSignature(text) {
  return String(text)
    .split("\n")[0]
    .replace(/0x[0-9a-fA-F]+/g, "0x…")
    .replace(/\s+/g, " ")
    .trim();
}

function consoleArgText(arg) {
  if (arg.value !== undefined) return String(arg.value);
  if (arg.description) return arg.description.split("\n")[0];
  if (arg.className) return arg.className;
  return arg.type || "";
}

// Mutated for the life of the run, then read by printDevOverlayAdvisory()
// from both the success and failure exit paths at the bottom of this file --
// this must report every run, not just a PASS, per the "never silently" rule.
const devOverlayState = {
  advisoryRan: false,
  collectedIssues: new Map(), // signature -> { source, level, signature, count, sample }
  overlayCheck: null,
  overlayCheckError: null,
};

function recordIssue(source, level, rawText) {
  const signature = normalizeSignature(rawText);
  if (!signature) return;
  const key = `${level}:${signature}`;
  const existing = devOverlayState.collectedIssues.get(key);
  if (existing) existing.count += 1;
  else devOverlayState.collectedIssues.set(key, { source, level, signature, count: 1, sample: String(rawText).slice(0, 500) });
}

// Best-effort read of the Next.js dev overlay's own DOM state. This is
// corroborating context for the report only -- the overlay's internal shadow-
// DOM markup is undocumented and Next-version-specific, so signature matching
// above relies on the console/runtime capture (stable browser APIs), not on
// parsing this structure.
async function checkDevOverlay(cdp) {
  return evaluate(
    cdp,
    `(() => {
      const portal = document.querySelector('nextjs-portal');
      if (!portal || !portal.shadowRoot) return { present: false };
      const text = portal.shadowRoot.textContent || "";
      const headingMatch = text.match(/Console Error|Build Error|Unhandled Runtime Error|Runtime Error/);
      return { present: true, heading: headingMatch ? headingMatch[0] : null };
    })()`,
  );
}

// Prints the advisory report. Called from BOTH the success and failure exit
// paths at the bottom of this file so a match is reported "prominently,
// never silently" regardless of the run's PASS/FAIL/INCONCLUSIVE verdict --
// and never throws, since a failure in here must not change that verdict.
function printDevOverlayAdvisory() {
  console.log("");
  console.log("=== Dev-overlay / console advisory (ADVISORY ONLY -- does not affect the verdict above) ===");
  if (!devOverlayState.advisoryRan) {
    console.log("DID NOT RUN -- console/runtime capture was never enabled (Chrome/CDP session never attached).");
    return;
  }
  const observed = [...devOverlayState.collectedIssues.values()];
  if (!observed.length) {
    console.log("No console errors/warnings observed during this run.");
  }
  const matchedBaseline = new Set();
  for (const issue of observed) {
    const baseline = matchBaseline(issue.signature);
    if (baseline) {
      matchedBaseline.add(baseline.match);
      console.log(`KNOWN  [${issue.source}/${issue.level}] (x${issue.count}) ${issue.signature.slice(0, 160)}`);
    } else {
      console.log(`NEW — not previously accepted  [${issue.source}/${issue.level}] (x${issue.count}) ${issue.signature.slice(0, 300)}`);
      console.log(`  -> a human must triage this: fix it, or add it to KNOWN_OVERLAY_ISSUES in browser-e2e.mjs with a dated reason.`);
    }
  }
  for (const known of KNOWN_OVERLAY_ISSUES) {
    if (!matchedBaseline.has(known.match)) {
      console.log(`STALE baseline entry (accepted ${known.acceptedDate}, not observed this run) -- consider removing: "${known.match}"`);
    }
  }
  if (devOverlayState.overlayCheckError) {
    console.log(`Dev-overlay DOM check: DID NOT RUN -- ${devOverlayState.overlayCheckError.message}`);
  } else if (devOverlayState.overlayCheck) {
    const { present, heading } = devOverlayState.overlayCheck;
    console.log(`Dev-overlay DOM check: nextjs-portal present=${present}${present ? `, heading=${heading ?? "none"}` : ""}`);
  }
}

const results = []; // { name, status: "PASS"|"FAIL"|"SKIP", detail }
function record(name, status, detail = "") {
  results.push({ name, status, detail });
  log(`${status === "PASS" ? "[PASS]" : "[FAIL]"} ${name}${detail ? ` -- ${detail}` : ""}`);
}

// ---------------------------------------------------------------------------
// Chrome discovery + launch
// ---------------------------------------------------------------------------

function findChromeBinary() {
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
  throw new EnvironmentError(
    `No Chrome/Chromium binary found (checked: ${candidates.join(", ")}; override with CHROME_PATH)`,
  );
}

async function findFreePort(startPort, attempts = 20) {
  const net = await import("node:net");
  for (let offset = 0; offset < attempts; offset++) {
    const candidate = startPort + offset;
    const free = await new Promise(resolve => {
      const server = net.createServer();
      server.once("error", () => resolve(false));
      server.listen(candidate, "127.0.0.1", () => {
        server.close(() => resolve(true));
      });
    });
    if (free) return candidate;
    log(`debugging port ${candidate} busy, trying next`);
  }
  throw new EnvironmentError(`No free debugging port found in range ${startPort}-${startPort + attempts - 1}`);
}

async function waitForCdpReady(port, timeoutMs = 15000) {
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
  throw new EnvironmentError(
    `Chrome's CDP endpoint on port ${port} never became reachable within ${timeoutMs}ms (last error: ${lastError?.message})`,
  );
}

function launchChrome(port, userDataDir) {
  const bin = findChromeBinary();
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    // Recent Chrome rejects CDP connections whose Host/Origin isn't
    // explicitly allowed; without this a same-machine, non-browser
    // WebSocket client can still get a 403 on the upgrade.
    "--remote-allow-origins=*",
    // Headless defaults to a small window (observed 756x469 elsewhere);
    // at that size a position:fixed element can cover the exact value a
    // screenshot is meant to prove, even though the CDP assertion itself
    // (which reads textContent, not pixels) is unaffected either way.
    "--window-size=1440,900",
  ];
  if (HEADLESS) args.push("--headless=new");

  const logFile = fs.openSync(path.join(ARTIFACT_DIR, `chrome-${port}.log`), "a");
  const child = spawn(bin, args, {
    detached: true,
    stdio: ["ignore", logFile, logFile],
  });
  child.unref();
  return child;
}

// ---------------------------------------------------------------------------
// Minimal CDP client (JSON-RPC over the native WebSocket)
// ---------------------------------------------------------------------------

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.eventListeners = new Map(); // method -> Set<fn>
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

  // One-shot listener for the next occurrence of `method`, resolving with
  // its params, bounded by timeoutMs so a missed event can't hang forever.
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

  // Persistent listener for every occurrence of `method` for the life of the
  // session -- used by the dev-overlay/console advisory collector below,
  // which needs to see every console message from CDP session attach through
  // the end of the run, not just one occurrence.
  on(method, handler) {
    if (!this.eventListeners.has(method)) this.eventListeners.set(method, new Set());
    this.eventListeners.get(method).add(handler);
  }
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    const desc = result.exceptionDetails.exception?.description || JSON.stringify(result.exceptionDetails);
    throw new Error(`Runtime.evaluate threw: ${desc}`);
  }
  return result.result?.value;
}

// Poll a condition expression (must evaluate to a truthy JS value) with a
// bounded timeout. Used for anything that ISN'T a full-page navigation --
// app hydration, a contract read landing, a tx confirming, a table
// re-rendering -- where there's no single CDP event to wait on instead.
async function waitFor(cdp, expression, { timeoutMs = 30000, intervalMs = 400, description = expression } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await evaluate(cdp, expression);
    if (last) return last;
    await sleep(intervalMs);
  }
  throw new AssertionFailure(`Timed out after ${timeoutMs}ms waiting for: ${description} (last value: ${JSON.stringify(last)})`);
}

// Full-page navigation waits on the actual CDP load event rather than
// polling document.readyState -- polling right after a client-side
// location.reload() can race and read the OLD document's already-"complete"
// state before the reload has actually started.
async function navigateAndWaitForLoad(cdp, url, timeoutMs = 30000) {
  const loaded = cdp.once("Page.loadEventFired", timeoutMs, `page load: ${url}`);
  const nav = await cdp.send("Page.navigate", { url });
  if (nav.errorText) throw new EnvironmentError(`Page.navigate to ${url} failed: ${nav.errorText}`);
  await loaded;
}

// Same idea, but for a navigation triggered by in-page JS (the burner
// wallet's window.location.reload() after selecting an account) rather
// than by us calling Page.navigate.
function waitForNextLoad(cdp, timeoutMs, description) {
  return cdp.once("Page.loadEventFired", timeoutMs, description);
}

async function screenshot(cdp, name) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
  const filePath = path.join(ARTIFACT_DIR, `${name}.png`);
  fs.writeFileSync(filePath, Buffer.from(data, "base64"));
  return filePath;
}

// ---------------------------------------------------------------------------
// Background block miner (for the pagination-under-live-blocks check)
// ---------------------------------------------------------------------------

function startMiner() {
  const script = `
    while true; do
      cast send --rpc-url ${RPC_URL} --private-key ${MINER_PRIVATE_KEY} --value 0 ${MINER_TO_ADDRESS} >/dev/null 2>&1
      sleep 1
    done
  `;
  return spawn("bash", ["-c", script], { stdio: "ignore" });
}

function stopMiner(miner) {
  if (miner && miner.exitCode === null) {
    try {
      miner.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  log(`Probing for a free Chrome debugging port starting at 9222...`);
  const debugPort = await findFreePort(9222);
  log(`Chosen debugging port: ${debugPort}`);

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "smoke-test-chrome-"));
  log(`Launching Chrome (${HEADLESS ? "headless" : "headful"}), profile dir: ${userDataDir}`);
  const chrome = launchChrome(debugPort, userDataDir);
  // From this point on, if anything throws, the catch handler below needs
  // enough to leave Chrome alive and record it in the shared state file --
  // same "preserve failure state for debugging" policy as Step 8.
  chromeHandleForFailure = { pid: chrome.pid, debugPort, userDataDir };

  await waitForCdpReady(debugPort);
  log(`Chrome CDP endpoint ready on port ${debugPort} (PID ${chrome.pid})`);

  const newTabRes = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT" });
  if (!newTabRes.ok) {
    throw new EnvironmentError(`PUT /json/new failed with HTTP ${newTabRes.status}`);
  }
  const tab = await newTabRes.json();
  if (!tab.webSocketDebuggerUrl) {
    throw new EnvironmentError(`New tab has no webSocketDebuggerUrl: ${JSON.stringify(tab)}`);
  }

  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener("error", err => reject(new EnvironmentError(`WebSocket connect failed: ${err.message}`)), {
      once: true,
    });
  });
  const cdp = new CDP(ws);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Log.enable");
  log(`CDP session attached to tab ${tab.id}`);

  // Dev-overlay/console advisory: register BEFORE any navigation so it
  // captures the whole session, not just messages after some later point.
  // See printDevOverlayAdvisory() for what happens with what's collected.
  cdp.on("Log.entryAdded", params => {
    if (params.entry.level !== "error") return;
    // entry.text alone is often a generic "Failed to load resource: net::ERR_FAILED" --
    // append the URL so the signature identifies WHICH resource, not any resource.
    const url = params.entry.url ? ` (url: ${params.entry.url})` : "";
    recordIssue("Log", "error", `${params.entry.text}${url}`);
  });
  cdp.on("Runtime.consoleAPICalled", params => {
    if (params.type !== "error" && params.type !== "warning") return;
    recordIssue("Console", params.type, params.args.map(consoleArgText).join(" "));
  });
  cdp.on("Runtime.exceptionThrown", params => {
    const desc = params.exceptionDetails.exception?.description || params.exceptionDetails.text;
    recordIssue("Exception", "error", desc);
  });
  devOverlayState.advisoryRan = true;

  let miner;

  // 1. Navigate to /debug
  await navigateAndWaitForLoad(cdp, `${FRONTEND_BASE}/debug`);
  log("Navigated to /debug");

  // 2. Contract rendered with its write form -- proves the deploy -> ABI ->
  // scaffold-hooks chain reached the frontend, not just that the page
  // returned 200.
  await waitFor(cdp, `!!document.querySelector('[data-testid="write-function-form-setGreeting"]')`, {
    timeoutMs: 45000,
    description: "your-contract's setGreeting write form rendered",
  });
  record("contract-rendered", "PASS", "write-function-form-setGreeting present");

  // 3. Read the default greeting() before connecting -- baseline for the
  // read-back assertion later.
  const defaultGreeting = await evaluate(
    cdp,
    `(() => {
      const el = document.querySelector('[data-testid="display-variable-greeting"] [data-testid="display-variable-value"]');
      return el ? el.textContent.trim() : null;
    })()`,
  );
  // displayTxResult() JSON.stringify()s plain string results (greeting()
  // isn't an address or hex), so the rendered text includes literal quotes.
  const expectedDefaultGreeting = JSON.stringify("Building Unstoppable Apps!!!");
  if (defaultGreeting !== expectedDefaultGreeting) {
    throw new AssertionFailure(`Expected default greeting() to render as ${expectedDefaultGreeting}, got: ${JSON.stringify(defaultGreeting)}`);
  }
  record("default-greeting", "PASS", defaultGreeting);

  // 4. Connect the burner wallet (in-page, no extension, no native dialog).
  //
  // Discovered while testing this script: for the arbitrumNitro network with
  // onlyLocalBurnerWallet (scaffold.config.ts), ScaffoldEthAppWithProviders.tsx
  // calls initBurnerPK() unconditionally on mount, and wagmi auto-reconnects
  // the burner connector -- so the wallet is very often ALREADY connected by
  // the time the write form renders, with no "Connect" click involved at all.
  // Handle both: only drive the Connect -> choose-account modal flow if the
  // Connect button actually shows up.
  const alreadyConnected = await evaluate(
    cdp,
    `(() => {
      const submitBtn = document.querySelector('[data-testid="write-function-submit"]');
      return !document.querySelector('[data-testid="connect-wallet"]') && !!submitBtn && !submitBtn.disabled;
    })()`,
  );

  if (alreadyConnected) {
    record("wallet-connected", "PASS", "auto-connected on load (burner wallet, no manual Connect needed)");
  } else {
    const clicked = await evaluate(
      cdp,
      `(() => {
        const btn = document.querySelector('[data-testid="connect-wallet"]');
        if (!btn) return "NOT_FOUND";
        btn.click();
        return "CLICKED";
      })()`,
    );
    if (clicked !== "CLICKED") throw new AssertionFailure(`Could not click Connect button: ${clicked}`);

    await waitFor(cdp, `!!document.querySelector('[data-testid="burner-account-option"]')`, {
      timeoutMs: 10000,
      description: "burner account chooser modal opened",
    });

    // Register the load listener BEFORE clicking -- selecting an account
    // calls window.location.reload() synchronously-ish, and a listener
    // registered after the click could miss it.
    const reloadWait = waitForNextLoad(cdp, 30000, "reload after burner account selection");
    const selected = await evaluate(
      cdp,
      `(() => {
        const btn = document.querySelector('[data-testid="burner-account-option"]');
        if (!btn) return "NOT_FOUND";
        btn.click();
        return "CLICKED";
      })()`,
    );
    if (selected !== "CLICKED") throw new AssertionFailure(`Could not click burner account option: ${selected}`);
    await reloadWait;
    log("Burner wallet selected, page reloaded");

    await waitFor(
      cdp,
      `(() => {
        const connectBtn = document.querySelector('[data-testid="connect-wallet"]');
        const submitBtn = document.querySelector('[data-testid="write-function-submit"]');
        return !connectBtn && !!submitBtn && !submitBtn.disabled;
      })()`,
      { timeoutMs: 30000, description: "wallet connected (Connect button gone, write form enabled)" },
    );
    record("wallet-connected", "PASS", "connected via explicit Connect -> choose-account flow");
  }

  // 5. Call setGreeting(<distinct value>) and let the burner wallet sign it.
  const newGreeting = `smoke-test-${Date.now()}`;
  const sendResult = await evaluate(
    cdp,
    `(() => {
      const form = document.querySelector('[data-testid="write-function-form-setGreeting"]');
      if (!form) return "NO_FORM";
      const input = form.querySelector('[data-testid="function-input"]');
      if (!input) return "NO_INPUT";
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, ${JSON.stringify(newGreeting)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      const sendBtn = form.querySelector('[data-testid="write-function-submit"]');
      if (!sendBtn) return "NO_SEND_BUTTON";
      if (sendBtn.disabled) return "SEND_DISABLED";
      sendBtn.click();
      return "CLICKED";
    })()`,
  );
  if (sendResult !== "CLICKED") throw new AssertionFailure(`Could not submit setGreeting: ${sendResult}`);
  log(`Submitted setGreeting("${newGreeting}")`);

  // 6. Wait for the tx to confirm AND read the value back -- this single
  // poll proves both: the displayed greeting only updates after the write
  // succeeds and the debug page's onChange-triggered refetch runs. Expect
  // the JSON.stringify()-quoted form -- see the default-greeting check above.
  const expectedNewGreeting = JSON.stringify(newGreeting);
  await waitFor(
    cdp,
    `(() => {
      const el = document.querySelector('[data-testid="display-variable-greeting"] [data-testid="display-variable-value"]');
      return el && el.textContent.trim() === ${JSON.stringify(expectedNewGreeting)};
    })()`,
    { timeoutMs: 60000, description: `greeting() read-back equals ${expectedNewGreeting}` },
  );
  record("write-and-readback", "PASS", `greeting() == ${expectedNewGreeting}`);

  const debugScreenshot = await screenshot(cdp, "debug-readback");
  log(`Screenshot: ${debugScreenshot}`);

  // 7. Block explorer: page through blocks while the devnode mines
  // continuously, confirming rows don't shift/duplicate/blank (the
  // regression this run exists to catch -- see 351a34a).
  await navigateAndWaitForLoad(cdp, `${FRONTEND_BASE}/blockexplorer`);
  await waitFor(cdp, `!!document.querySelector('[data-testid="blockexplorer-table"]')`, {
    timeoutMs: 30000,
    description: "block explorer table rendered",
  });

  miner = startMiner();
  log("Started background miner (1 tx/s) to keep blocks flowing during pagination");

  // Read each row's block number (for the blank-cell check) AND its
  // transaction hash (via the row's link to /blockexplorer/transaction/<hash>).
  // Block number alone is not a valid duplicate-row signal: when a block's
  // transactions straddle a page boundary, the same block number legitimately
  // appears on both pages for two DIFFERENT transactions. Hash identity is
  // what "duplicate row" actually means.
  const readRows = `(() => Array.from(document.querySelectorAll('[data-testid="blockexplorer-row"]')).map(row => {
    const blockNum = row.querySelector('[data-testid="blockexplorer-block-number"]')?.textContent.trim() ?? "";
    const link = row.querySelector('a[href*="/blockexplorer/transaction/"]');
    const hash = link ? link.getAttribute("href").split("/").pop() : "";
    return { blockNum, hash };
  }))()`;
  const page1Rows = await evaluate(cdp, readRows);
  if (!page1Rows.length) {
    stopMiner(miner);
    throw new AssertionFailure("Block explorer page 1 rendered no rows -- expected at least the deploy/write transactions");
  }
  if (page1Rows.some(r => r.blockNum === "" || r.hash === "")) {
    stopMiner(miner);
    throw new AssertionFailure(`Block explorer page 1 has a blank block-number or tx-hash cell: ${JSON.stringify(page1Rows)}`);
  }
  log(`Page 1 rows: ${JSON.stringify(page1Rows)}`);

  const page1Label = await evaluate(
    cdp,
    `document.querySelector('[data-testid="blockexplorer-page-label"]').textContent.trim()`,
  );
  const page1RowsJson = JSON.stringify(page1Rows);

  const nextClicked = await evaluate(
    cdp,
    `(() => {
      const btn = document.querySelector('[data-testid="blockexplorer-next-page"]');
      if (!btn) return "NO_BUTTON";
      if (btn.disabled) return "DISABLED";
      btn.click();
      return "CLICKED";
    })()`,
  );

  if (nextClicked === "DISABLED") {
    log("Next-page button disabled (fewer blocks than fit on one page) -- pagination check inconclusive, not failed");
    record("blockexplorer-pagination", "SKIP", "only one page of blocks available");
  } else if (nextClicked !== "CLICKED") {
    stopMiner(miner);
    throw new AssertionFailure(`Could not click block explorer next-page button: ${nextClicked}`);
  } else {
    // Wait for BOTH the page label to advance AND the row data itself to
    // change from page 1's snapshot. The label is cheap React state that
    // commits synchronously on click; the table's row data depends on an
    // async re-fetch (walks blocks backward from the pagination anchor over
    // the websocket RPC) that lands on a LATER render. Waiting on the label
    // alone races ahead of that re-fetch and can read page 1's stale rows
    // under an already-updated "Page 2" label -- confirmed via manual replay
    // against the live stack: immediately after the label flip the rows were
    // still byte-identical to page 1, and ~2s later (still no further click)
    // they had settled into the correct, non-duplicate page 2 rows.
    await waitFor(
      cdp,
      `(() => {
        const label = document.querySelector('[data-testid="blockexplorer-page-label"]')?.textContent.trim();
        if (label === ${JSON.stringify(page1Label)}) return false;
        const rows = ${readRows};
        return JSON.stringify(rows) !== ${JSON.stringify(page1RowsJson)};
      })()`,
      { timeoutMs: 15000, description: "page label advanced past page 1 AND row data refreshed to new content" },
    );
    const page2Rows = await evaluate(cdp, readRows);
    log(`Page 2 rows: ${JSON.stringify(page2Rows)}`);

    if (!page2Rows.length) {
      stopMiner(miner);
      throw new AssertionFailure("Block explorer page 2 rendered no rows after a successful page-forward click");
    }
    if (page2Rows.some(r => r.blockNum === "" || r.hash === "")) {
      stopMiner(miner);
      throw new AssertionFailure(`Block explorer page 2 has a blank block-number or tx-hash cell: ${JSON.stringify(page2Rows)}`);
    }
    const page1Hashes = page1Rows.map(r => r.hash);
    const page2Hashes = page2Rows.map(r => r.hash);
    const overlap = page2Hashes.filter(h => page1Hashes.includes(h));
    if (overlap.length) {
      stopMiner(miner);
      throw new AssertionFailure(`Block explorer pages 1 and 2 share transaction(s) ${JSON.stringify(overlap)} -- pagination is duplicating rows under live mining`);
    }
    record("blockexplorer-pagination", "PASS", "page 2 has no blank/duplicate rows vs page 1, despite continuous mining");
  }

  stopMiner(miner);

  const explorerScreenshot = await screenshot(cdp, "blockexplorer-pagination");
  log(`Screenshot: ${explorerScreenshot}`);

  // 8. Homepage -- console/overlay coverage only, no new hard assertion
  // beyond "it rendered". The burner wallet is already connected by this
  // point (step 4), so the homepage's <Address address={connectedAddress} />
  // renders for real here, unlike /debug and /blockexplorer which never
  // show it -- this is the page where the ENS name/avatar lookups in
  // Address.tsx actually fire, and the whole reason that codepath went
  // unseen by this script before.
  await navigateAndWaitForLoad(cdp, `${FRONTEND_BASE}/`);
  await waitFor(cdp, `document.body.textContent.includes("Scaffold-Stylus")`, {
    timeoutMs: 30000,
    description: "homepage rendered",
  });
  record("homepage-rendered", "PASS", "homepage loaded, console/overlay coverage collected");
  const homepageScreenshot = await screenshot(cdp, "homepage");
  log(`Screenshot: ${homepageScreenshot}`);

  // Dev-overlay/console advisory: best-effort DOM read, after the full flow
  // has run so the overlay has had every chance to have picked something up.
  // Failure here is caught, not thrown -- an advisory that can crash Step 7
  // would no longer be advisory. See printDevOverlayAdvisory() at exit.
  try {
    devOverlayState.overlayCheck = await checkDevOverlay(cdp);
  } catch (err) {
    devOverlayState.overlayCheckError = err;
  }

  // Clean shutdown: close our tab, then kill Chrome and its temp profile.
  await fetch(`http://127.0.0.1:${debugPort}/json/close/${tab.id}`).catch(() => {});
  await killChromeGroup(chrome.pid);
  fs.rmSync(userDataDir, { recursive: true, force: true });
  unsetState("chromePid");
  unsetState("chromeDebugPort");
  unsetState("chromeUserDataDir");

  return { debugScreenshot, explorerScreenshot, homepageScreenshot };
}

async function killChromeGroup(pid) {
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
}

let chromeHandleForFailure = null;

main()
  .then(({ debugScreenshot, explorerScreenshot, homepageScreenshot }) => {
    console.log("");
    console.log("=== Step 7 results ===");
    for (const r of results) console.log(`${r.status}: ${r.name}${r.detail ? ` (${r.detail})` : ""}`);
    console.log(`Screenshots: ${debugScreenshot}, ${explorerScreenshot}, ${homepageScreenshot}`);
    printDevOverlayAdvisory();
    console.log("RESULT: PASS");
    process.exit(0);
  })
  .catch(async err => {
    console.log("");
    console.log("=== Step 7 results ===");
    for (const r of results) console.log(`${r.status}: ${r.name}${r.detail ? ` (${r.detail})` : ""}`);
    printDevOverlayAdvisory();

    const isEnvIssue = err instanceof EnvironmentError;
    console.log(`RESULT: ${isEnvIssue ? "INCONCLUSIVE" : "FAIL"}: ${err.message}`);

    if (chromeHandleForFailure) {
      const { pid, debugPort, userDataDir } = chromeHandleForFailure;
      setState("chromePid", pid);
      setState("chromeDebugPort", debugPort);
      setState("chromeUserDataDir", userDataDir);
      console.log(`Chrome left running for debugging: PID=${pid} debugPort=${debugPort} profileDir=${userDataDir}`);
      console.log(`Inspect via: http://127.0.0.1:${debugPort}/json (or point chrome://inspect at it)`);
      console.log(`Clean up later with: .claude/skills/smoke-test/teardown.sh`);
    }

    process.exit(isEnvIssue ? 1 : 2);
  });
