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
// *** SELECTOR VERIFICATION STATUS ***
// LIVE-VERIFIED end to end on 2026-07-22, once the real profile's vault was
// actually initialised (see SKILL.md Onboarding -- it was not, initially;
// a non-empty extension-storage directory is not evidence of an
// initialised vault, and this skill nearly shipped that false assumption).
// The full chain was driven for real against Arbitrum Sepolia: unlock() ->
// wallet_addEthereumChain (0x66eee, not preconfigured -- see SKILL.md
// "Measured unknowns") -> connect() via EIP-6963 -> a real
// eth_sendTransaction, mined and confirmed (status: 1) on-chain. Every
// selector below is exactly what was clicked in that run, not a guess:
//   - '[data-testid="unlock-password"]' / '[data-testid="unlock-submit"]'
//     -- the unlock screen.
//   - '[data-testid="unlock-page-help-text"]' -- the wrong-password error
//     banner (locale-agnostic; this profile's MetaMask renders in
//     Vietnamese, so text-matching would have been a trap of its own).
//   - '[data-testid="confirm-btn"]' -- the connect-permissions screen's
//     approve button (a single screen in this run, not the two some older
//     MetaMask versions used).
//   - '[data-testid="confirm-footer-button"]' -- approves BOTH a
//     wallet_addEthereumChain confirmation and a transaction confirmation;
//     MetaMask reuses the same confirmation-screen component for both, so
//     approveTx() also happens to be the right primitive for approving an
//     add-network request, without needing a separate function.
// The remaining entries in each clickFirstMatch() fallback list below
// (page-container-footer-next, connect-account-confirm, a bare
// button[type="submit"]) were NEVER exercised in this run -- the
// live-confirmed selector matched first every time. They stay as
// defensive fallbacks for other MetaMask versions, but are NOT confirmed;
// treat a run that falls through to one of them as a signal to
// investigate, not as proof they work.
//
// Primitives:
//   unlock({ port, extensionId, password })
//   connect({ port, extensionId, dappCdp })
//   approveTx({ port, extensionId })       -- also approves add-network requests
//   waitForTarget(port, predicate, opts)

import { CDP, evaluate, EnvironmentError } from "./launch.mjs";

// Distinct from EnvironmentError: this means CDP/Chrome/MetaMask all worked
// correctly and the password itself was rejected -- a Keychain/vault
// mismatch, not a script bug. preflight.mjs's Keychain check matches on
// this class specifically (not on the error TEXT, which is locale-specific
// -- MEASURED: this profile's MetaMask renders in Vietnamese, "Mật khẩu
// không chính xác. Vui lòng thử lại.") so the check works regardless of the
// browser's UI language.
export class IncorrectPasswordError extends Error {}

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
// MEASURED (2026-07-22): MetaMask 13.35.1.0 runs under LavaMoat "scuttling",
// which throws `Error: LavaMoat - property "HTMLInputElement" of globalThis
// is inaccessible under scuttling mode` the moment page JS touches a global
// constructor's prototype (the usual React-controlled-input trick of
// grabbing the native value setter off HTMLInputElement.prototype to bypass
// React's own setter). That rules out setting .value via JS entirely on
// this extension. The working alternative: focus the element with a plain
// instance method call (`el.focus()` -- not a global lookup, LavaMoat
// allows it), then use CDP's own `Input.insertText`, which inserts text at
// the browser level as if typed, never touching page-global objects at all.
async function fillInput(cdp, selector, text) {
  const focused = await evaluate(
    cdp,
    `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return "NOT_FOUND";
      el.focus();
      return document.activeElement === el ? "FOCUSED" : "FOCUS_FAILED";
    })()`,
  );
  if (focused !== "FOCUSED") throw new EnvironmentError(`Could not focus ${selector} (${focused})`);
  await cdp.send("Input.insertText", { text });
}

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
    // MEASURED (2026-07-22): a fixed sleep before checking lock state is a
    // real bug, not just slow -- observed directly: at 500ms-1500ms after
    // navigation, home.html has rendered NOTHING yet (zero [data-testid]
    // elements at all, on a headless launch), so a same-moment "is the
    // unlock screen present" check reads false and this function concluded
    // "already unlocked" when the app simply hadn't painted anything yet.
    // That is a false negative that would have silently skipped testing the
    // password entirely -- exactly the failure shape this skill's own
    // preflight check 4 exists to catch elsewhere (a proxy that looks like
    // it proves something but doesn't). Poll for the app to render ANYTHING
    // recognizable first, then decide.
    await sleepUntil(async () => (await evaluate(cdp, `document.querySelectorAll('[data-testid]').length`)) > 0, 8000);
    const url = await evaluate(cdp, "document.URL");

    if (url.includes("#/onboarding")) {
      throw new EnvironmentError(
        "MetaMask is mid-onboarding (no vault yet), not locked -- this is not something unlock() can fix. " +
          "See SKILL.md Onboarding step 3: a seed must be imported by hand first.",
      );
    }

    const isLocked = await evaluate(cdp, `!!document.querySelector('[data-testid="unlock-password"]')`);
    if (!isLocked) {
      return { alreadyUnlocked: true };
    }

    await fillInput(cdp, '[data-testid="unlock-password"]', password);
    const clicked = await clickFirstMatch(cdp, ['[data-testid="unlock-submit"]', 'button[type="submit"]']);
    if (!clicked) throw new EnvironmentError("Could not find an unlock-submit button");

    // Race the two outcomes MetaMask actually has for a submitted password:
    // the password input disappearing (success) or its own error banner
    // appearing (rejected) -- LIVE-VERIFIED selector for the latter,
    // `[data-testid="unlock-page-help-text"]`, found while diagnosing a real
    // Keychain/vault password mismatch on 2026-07-22.
    const outcome = await sleepUntil(async () => {
      const stillLocked = await evaluate(cdp, `!!document.querySelector('input[type="password"]')`);
      if (!stillLocked) return "unlocked";
      const errorText = await evaluate(cdp, `document.querySelector('[data-testid="unlock-page-help-text"]')?.textContent?.trim() || ""`);
      if (errorText) return "rejected";
      return null;
    }, 10000);
    if (outcome === "rejected") {
      throw new IncorrectPasswordError(
        "MetaMask rejected the password (the vault's own error banner appeared) -- the value stored in " +
          "the Keychain does not match this vault's actual password.",
      );
    }
    return { alreadyUnlocked: false };
  } finally {
    ws.close();
  }
}

// Returns whatever truthy value conditionFn() produces (not just a
// boolean), so callers racing multiple distinct outcomes (e.g. "unlocked"
// vs "rejected" above) can tell which one actually happened.
async function sleepUntil(conditionFn, timeoutMs, intervalMs = 300) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await conditionFn();
    if (result) return result;
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
    // LIVE-VERIFIED (2026-07-22): this build's connect flow is a single
    // screen -- '[data-testid="confirm-btn"]' resolved eth_requestAccounts
    // immediately, no second screen appeared. The loop below still handles
    // a multi-screen flow defensively (older/other MetaMask builds have
    // used one), clicking whichever "proceed" button is present and
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
// transient-popup race as connect() -- MEASURED directly (2026-07-22): the
// first /json/list poll right after triggering eth_sendTransaction found no
// notification.html target at all; it appeared roughly a second later.
// Callers trigger the request (e.g. calling eth_sendTransaction, or a
// dapp's "Send" button) and then call this to drive the resulting
// MetaMask confirmation to completion. Also works, unmodified, for a
// wallet_addEthereumChain confirmation -- MetaMask renders both through
// the same confirmation-screen component and the same confirm-footer-button.
//
// MEASURED (2026-07-22, building demo-video/PR 2): a SECOND race, inside the
// popup itself, not just around its existence. Attaching CDP the moment
// `/json/list` reports the notification.html target existing is not the
// same as that target having painted anything yet -- clickFirstMatch() ran
// against a still-blank document and found no match, even though the exact
// same '[data-testid="confirm-footer-button"]' selector was confirmed
// present and clickable ~1.5s later via a manual repro. This is the same
// failure shape unlock() already had to fix (a target existing is not the
// same as it having rendered) -- applying the same fix here: poll for a
// recognizable element before attempting to click, instead of one
// immediate attempt.
// ---------------------------------------------------------------------------
export async function approveTx({ port, extensionId, timeoutMs = 20000 }) {
  const popup = await waitForTarget(
    port,
    t => t.type === "page" && t.url.startsWith(`chrome-extension://${extensionId}/notification.html`),
    { timeoutMs, description: "MetaMask transaction confirmation popup (notification.html)" },
  );
  const { cdp, ws } = await attach(popup);
  try {
    await sleepUntil(async () => (await evaluate(cdp, `document.querySelectorAll('[data-testid]').length`)) > 0, 8000);
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
