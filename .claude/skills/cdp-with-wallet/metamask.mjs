#!/usr/bin/env node
// .claude/skills/cdp-with-wallet/metamask.mjs
//
// MetaMask primitives: unlock / connect / approveTx / waitForTarget. This is
// the reusable part of the skill -- callers bring their own dapp page (a CDP
// target already navigated to the app under test) and their own Chrome
// launch (see launch.mjs); this file only knows how to drive MetaMask's own
// extension pages via raw CDP, following the technique demonstrated in
// Brove's packages/nextjs/e2e/helpers/braavos.ts: enumerate targets from
// GET /json, find the extension page by URL prefix, attach a WebSocket
// directly to it. Braavos itself is a different extension with different
// selectors -- only the TECHNIQUE carries over, not any selector or path.
//
// *** SELECTOR VERIFICATION STATUS (2026-07-22) ***
// The selectors below could NOT be verified against a live unlocked
// instance. Two independent blockers, both measured on this machine:
//   1. The real debug profile's MetaMask vault is not initialised -- no
//      seed has been imported (see preflight.mjs check 3 / SKILL.md). Its
//      home.html redirects to #/onboarding/welcome, never to an unlock
//      screen, and chrome.storage.local's AccountsController has zero
//      accounts. This directly contradicts the assumption the skill was
//      designed under ("MetaMask is already set up, only the password is
//      needed") -- run preflight.mjs (its check 3 does this same live
//      check) before trusting these selectors against your profile.
//   2. A disposable substitute (copying the installed extension into a temp
//      profile via --load-extension, to discover selectors without touching
//      the real profile) does not work either: Chrome's content-verification
//      system rejects it outright --
//      "Content verify job failed for extension: <id> at path: home.html and
//      for reason:1" (hash mismatch) -- even with the installed copy's
//      _metadata/ stripped. Web-Store-installed extensions cannot be
//      reloaded unpacked under their real ID on this Chrome build.
// The onboarding-screen testids below (onboarding-create-wallet,
// onboarding-import-wallet) ARE live-verified -- that screen was reachable.
// unlock-password / unlock-submit and the connect/confirm-screen selectors
// are carried over from MetaMask's long-stable public test-id conventions,
// NOT observed live on 13.35.1.0. Confirm them (or fix them) the first time
// this skill is run against a real unlocked account, before relying on it.
//
// Primitives:
//   unlock({ port, extensionId, password })
//   connect({ port, extensionId, dappCdp })
//   approveTx({ port, extensionId })
//   waitForTarget(port, predicate, opts)

import { CDP, evaluate, EnvironmentError } from "./launch.mjs";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Target discovery -- the "transient popup race" guard.
//
// MEASURED RISK (not yet empirically timed -- see verification-status header
// above): MetaMask's connect/confirm popups are ordinary CDP page targets
// that only exist while the notification window is open. A caller that reads
// GET /json once, right after triggering a dapp request, can race ahead of
// Chrome actually creating that window and see it as absent. This mirrors
// browser-e2e.mjs's waitFor() -- poll a condition with a bounded timeout
// instead of a single check.
// ---------------------------------------------------------------------------
export async function waitForTarget(port, predicate, { timeoutMs = 15000, intervalMs = 300, description = "target" } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const list = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
    const target = list.find(predicate);
    if (target) return target;
    await sleep(intervalMs);
  }
  throw new EnvironmentError(`Timed out after ${timeoutMs}ms waiting for: ${description}`);
}

async function attach(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener("error", err => reject(new EnvironmentError(`WebSocket connect failed: ${err.message}`)), { once: true });
  });
  const cdp = new CDP(ws);
  await cdp.send("Runtime.enable");
  return { cdp, ws };
}

// Tries a list of selectors in order, clicking the first one found. Prefers
// data-testid (stable across locale -- this profile's MetaMask renders in
// Vietnamese, e.g. "Tạo ví mới" / "Tôi đã có ví" on the onboarding screen, so
// any English text match would silently never fire there) over role/text
// matching, which is kept only as a last-resort fallback.
async function clickFirstMatch(cdp, selectors) {
  return evaluate(
    cdp,
    `(() => {
      const selectors = ${JSON.stringify(selectors)};
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && !el.disabled) {
          el.click();
          return sel;
        }
      }
      return null;
    })()`,
  );
}

// ---------------------------------------------------------------------------
// unlock(password) -- open home.html; if the unlock screen is present, fill
// and submit. If MetaMask is already unlocked (or mid-onboarding, which is a
// distinct, non-scriptable state -- see preflight.mjs check 3), this is a
// no-op / explicit error rather than a silent false PASS.
// ---------------------------------------------------------------------------
export async function unlock({ port, extensionId, password }) {
  const res = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(`chrome-extension://${extensionId}/home.html`)}`, {
    method: "PUT",
  });
  if (!res.ok) throw new EnvironmentError(`Could not open MetaMask home.html: HTTP ${res.status}`);
  const tab = await res.json();
  const { cdp, ws } = await attach(tab);
  try {
    await sleep(1500); // let the extension's router settle before reading document.URL
    const url = await evaluate(cdp, "document.URL");

    if (url.includes("#/onboarding")) {
      throw new EnvironmentError(
        "MetaMask is mid-onboarding (no vault yet), not locked -- this is not something unlock() can fix. " +
          "See SKILL.md Onboarding step 3: a seed must be imported by hand first.",
      );
    }

    const isLocked = await evaluate(cdp, `!!document.querySelector('[data-testid="unlock-password"]') || !!document.querySelector('input[type="password"]')`);
    if (!isLocked) {
      return { alreadyUnlocked: true };
    }

    await evaluate(
      cdp,
      `(() => {
        const input = document.querySelector('[data-testid="unlock-password"]') || document.querySelector('input[type="password"]');
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        setter.call(input, ${JSON.stringify(password)});
        input.dispatchEvent(new Event("input", { bubbles: true }));
      })()`,
    );
    const clicked = await clickFirstMatch(cdp, ['[data-testid="unlock-submit"]', 'button[type="submit"]']);
    if (!clicked) throw new EnvironmentError("Could not find an unlock-submit button");

    await sleepUntil(async () => !(await evaluate(cdp, `!!document.querySelector('input[type="password"]')`)), 10000);
    return { alreadyUnlocked: false };
  } finally {
    ws.close();
  }
}

async function sleepUntil(conditionFn, timeoutMs, intervalMs = 300) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await conditionFn()) return;
    await sleep(intervalMs);
  }
  throw new EnvironmentError(`Condition not met within ${timeoutMs}ms`);
}

// ---------------------------------------------------------------------------
// connect() -- select the connector by EIP-6963 rdns === "io.metamask",
// NEVER by button position (a dapp's connector list order depends on
// extension load order / announce timing, which this skill does not
// control). `dappCdp` is an already-attached CDP session on the dapp's own
// page (the caller navigates there first); this function only injects the
// EIP-6963 discovery + eth_requestAccounts call into THAT page, then
// switches to the resulting MetaMask popup to approve it.
// ---------------------------------------------------------------------------
export async function connect({ port, extensionId, dappCdp }) {
  // Ask the page for every announced EIP-6963 provider, matched by rdns.
  const requestPromise = evaluate(
    dappCdp,
    `(() => {
      return new Promise((resolve, reject) => {
        const providers = [];
        function onAnnounce(event) { providers.push(event.detail); }
        window.addEventListener("eip6963:announceProvider", onAnnounce);
        window.dispatchEvent(new Event("eip6963:requestProvider"));
        setTimeout(() => {
          window.removeEventListener("eip6963:announceProvider", onAnnounce);
          const match = providers.find(p => p.info?.rdns === "io.metamask");
          if (!match) {
            reject(new Error("No EIP-6963 provider announced rdns=io.metamask (providers seen: " + providers.map(p => p.info?.rdns).join(", ") + ")"));
            return;
          }
          match.provider.request({ method: "eth_requestAccounts" }).then(resolve, reject);
        }, 500);
      });
    })()`,
  );

  // eth_requestAccounts opens MetaMask's connect popup as a side effect --
  // race against that popup appearing (see waitForTarget's header comment).
  const popup = await waitForTarget(
    port,
    t => t.type === "page" && t.url.startsWith(`chrome-extension://${extensionId}/notification.html`),
    { timeoutMs: 15000, description: "MetaMask connect popup (notification.html)" },
  );
  const { cdp: popupCdp, ws } = await attach(popup);
  try {
    // Modern MetaMask connect flows are 1-2 screens (permissions overview,
    // then a final confirm) -- click whichever "proceed" button is present,
    // repeating until the popup closes or eth_requestAccounts resolves.
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const clicked = await clickFirstMatch(popupCdp, [
        '[data-testid="confirm-btn"]',
        '[data-testid="page-container-footer-next"]',
        '[data-testid="connect-account-confirm"]',
        'button[type="submit"]',
      ]).catch(() => null); // popup may close mid-poll -- target gone is not a failure here
      if (clicked) await sleep(700);
      const stillOpen = await fetch(`http://127.0.0.1:${port}/json/list`)
        .then(r => r.json())
        .then(list => list.some(t => t.id === popup.id));
      if (!stillOpen) break;
      await sleep(300);
    }
  } finally {
    ws.close();
  }

  const accounts = await requestPromise;
  return { accounts };
}

// ---------------------------------------------------------------------------
// approveTx() -- attach to the notification.html target and confirm. Same
// transient-popup race as connect(); callers trigger the tx (e.g. clicking
// a dapp's "Send" button) and then call this to drive the resulting
// MetaMask confirmation to completion.
// ---------------------------------------------------------------------------
export async function approveTx({ port, extensionId, timeoutMs = 20000 }) {
  const popup = await waitForTarget(
    port,
    t => t.type === "page" && t.url.startsWith(`chrome-extension://${extensionId}/notification.html`),
    { timeoutMs, description: "MetaMask transaction confirmation popup (notification.html)" },
  );
  const { cdp, ws } = await attach(popup);
  try {
    const clicked = await clickFirstMatch(cdp, [
      '[data-testid="confirm-footer-button"]',
      '[data-testid="page-container-footer-next"]',
      '[data-testid="confirm-btn"]',
      'button[type="submit"]',
    ]);
    if (!clicked) throw new EnvironmentError("Could not find a confirm/approve button on the transaction popup");
    return { clickedSelector: clicked };
  } finally {
    ws.close();
  }
}
