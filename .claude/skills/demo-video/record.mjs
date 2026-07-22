#!/usr/bin/env node
// .claude/skills/demo-video/record.mjs
//
// Orchestrates the two demo-video takes:
//   Take 1 -- terminal: wraps smoke-test Step 9 (Sepolia deploy) exactly as
//             it already exists, recorded with asciinema.
//   Take 2 -- browser: drives a real MetaMask connect + write tx against the
//             just-deployed Sepolia contract via cdp-with-wallet, recorded
//             with CDP's own Page.startScreencast (NOT macOS screencapture --
//             see SKILL.md "Why CDP screencast, not screencapture").
//
// Sequencing (the "sequencing trap" from the spec): Step 9's own cleanup
// (9f, restoring packages/nextjs/contracts/deployedContracts.ts) is deferred
// until AFTER Take 2 runs, because Take 2 needs that file's Sepolia entry to
// have anything to show in the frontend. See cleanupAll() below, which is
// the only place 9f-equivalent cleanup happens, run in a `finally` so it
// fires regardless of outcome.
//
// Zero npm dependencies, matching .claude/skills/smoke-test/browser-e2e.mjs
// and .claude/skills/cdp-with-wallet/*.mjs.
//
// Usage:
//   node record.mjs all        -- take1, then take2, then cleanup (default)
//   node record.mjs take1      -- terminal take only (no cleanup -- leaves
//                                  deployedContracts.ts with the Sepolia
//                                  entry on purpose, for a manual take2)
//   node record.mjs take2      -- browser take only (assumes take1 already
//                                  ran and deployedContracts.ts has the
//                                  Sepolia entry)
//   node record.mjs cleanup    -- restore scaffold.config.ts /
//                                  deployedContracts.ts, kill any leaked
//                                  frontend/Chrome -- the escape hatch if a
//                                  run crashed mid-flight

import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CDP,
  evaluate,
  findFreePort,
  isolateExtensions,
  killChromeGroup,
  launchChrome,
  METAMASK_EXTENSION_ID,
  restoreExtensions,
  waitForCdpReady,
} from "../cdp-with-wallet/launch.mjs";
import { approveTx, connect, unlock } from "../cdp-with-wallet/metamask.mjs";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Path resolution -- same git-common-dir technique as cdp-with-wallet's
// preflight.mjs. packages/stylus/.env is untracked and normally only exists
// in the main checkout, never in a worktree's own copy of the tree; this
// skill is meant to be run from either.
// ---------------------------------------------------------------------------
function mainCheckoutRoot() {
  try {
    const gitCommonDir = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
      cwd: process.cwd(),
      encoding: "utf8",
    }).trim();
    return path.dirname(gitCommonDir);
  } catch {
    return process.cwd();
  }
}

function worktreeRoot() {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: process.cwd(), encoding: "utf8" }).trim();
}

// Regex-per-key extraction, matching preflight.mjs's own style -- no dotenv
// dependency on this side (packages/stylus/scripts/utils/network.ts already
// depends on dotenv itself; that's the existing codebase, not this script).
function readStylusEnvKey(envPath, key) {
  if (!fs.existsSync(envPath)) return undefined;
  const text = fs.readFileSync(envPath, "utf8");
  const match = text.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match && match[1].trim() ? match[1].trim() : undefined;
}

function readStylusEnv(checkoutRoot) {
  const envPath = path.join(checkoutRoot, "packages", "stylus", ".env");
  const keys = ["ACCOUNT_ADDRESS_SEPOLIA", "RPC_URL_SEPOLIA", "PRIVATE_KEY_SEPOLIA"];
  const out = {};
  for (const key of keys) {
    const value = readStylusEnvKey(envPath, key);
    if (value) out[key] = value;
  }
  return out;
}

// Never printed, echoed, or logged -- same contract as cdp-with-wallet.
function getKeychainPassword(service = "stylus-demo-metamask") {
  return execFileSync("security", ["find-generic-password", "-s", service, "-w"], { encoding: "utf8" }).trim();
}

async function waitForHttpReady(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return true;
    } catch (err) {
      lastErr = err;
    }
    await sleep(500);
  }
  throw new Error(`${url} never became ready within ${timeoutMs}ms (last error: ${lastErr?.message})`);
}

async function waitFor(cdp, expression, timeoutMs, description = expression) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await evaluate(cdp, expression).catch(() => false);
    if (ok) return true;
    await sleep(300);
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for: ${description}`);
}

// ---------------------------------------------------------------------------
// Take 1 -- terminal: smoke-test Step 9 (9a-9e only; 9f is deferred to
// cleanupAll()), recorded with asciinema. This is the ACTUAL deploy command,
// not a replay -- if it drifts from Step 9 as documented, that is a bug in
// this script, not an acceptable trade-off (see SKILL.md).
// ---------------------------------------------------------------------------

const STEP9_SCRIPT_PATH = path.join(HERE, "step9.sh");

async function take1({ outDir, cwd, checkoutRoot }) {
  const envVars = readStylusEnv(checkoutRoot);
  const resultPath = path.join(os.tmpdir(), `demo-video-step9-result-${process.pid}.json`);

  const castPath = path.join(outDir, "take1-terminal-sepolia-deploy.cast");
  const gifPath = path.join(outDir, "take1-terminal-sepolia-deploy.gif");

  console.log(`[take1] recording -> ${castPath}`);
  const rec = spawnSync(
    "asciinema",
    ["record", "--command", `bash ${STEP9_SCRIPT_PATH}`, "--output-format", "asciicast-v3", "--return", "--overwrite", castPath],
    {
      cwd,
      stdio: "inherit",
      env: { ...process.env, ...envVars, DEMO_RESULT_FILE: resultPath },
    },
  );

  let result;
  try {
    result = JSON.parse(fs.readFileSync(resultPath, "utf8"));
  } catch {
    result = { status: "FAIL", reason: `Step 9 script produced no result file (asciinema exit ${rec.status})`, address: null, txHash: null };
  }
  fs.rmSync(resultPath, { force: true });

  if (!fs.existsSync(castPath) || fs.statSync(castPath).size < 100) {
    throw new Error(`Take 1 recording missing or trivially small: ${castPath}`);
  }
  const castSize = fs.statSync(castPath).size;

  let gifSize = null;
  if (result.status === "PASS") {
    console.log(`[take1] converting to GIF -> ${gifPath}`);
    execFileSync("agg", [castPath, gifPath], { stdio: "inherit" });
    gifSize = fs.statSync(gifPath).size;
  } else {
    console.log(`[take1] status=${result.status}, skipping GIF conversion`);
  }

  return { ...result, castPath, gifPath: gifSize ? gifPath : null, castSize, gifSize };
}

// ---------------------------------------------------------------------------
// Take 2 -- browser: real MetaMask connect + write tx against the just-
// deployed Sepolia contract, recorded via CDP Page.startScreencast.
//
// Why CDP screencast, not macOS `screencapture -v`: the original design used
// screencapture, which requires the macOS Screen Recording TCC permission
// for whichever app hosts the invoking process. That permission was granted
// mid-build but had NOT taken effect (macOS only applies a TCC grant on
// process restart, and the host app was not restarted) -- yet a probe
// recording still succeeded (ffprobe-verified: real duration, real
// dimensions, real frame count -- see SKILL.md). The user's own call, given
// that ambiguity and the cost of a restart, was to switch to CDP's
// Page.startScreencast instead: it captures frames from inside Chrome, needs
// no OS permission, works headless, and works in CI. This is the approach
// actually implemented below, not screencapture.
//
// THE TRAP: Page.screencastFrame does NOT fire at a fixed rate -- only when
// the page repaints -- and each frame must be acked via
// Page.screencastFrameAck or the stream stalls. Naively dumping frames to
// disk and assembling at a fixed fps would compress long-idle periods and
// stretch busy ones, producing a video whose timing has nothing to do with
// what actually happened (a valid file that plays, but is silently wrong --
// the same failure class as everything else flagged in this spec). The fix:
// record each frame's own `metadata.timestamp` (seconds since epoch) and
// assemble with ffmpeg's concat demuxer using a per-frame `duration` entry
// computed from the gap to the NEXT frame's timestamp, not a fixed rate.
// ---------------------------------------------------------------------------

async function startScreencastCapture(cdp, framesDir, { format = "png", maxWidth = 1280, maxHeight = 800 } = {}) {
  fs.mkdirSync(framesDir, { recursive: true });
  const frames = [];
  let idx = 0;
  let stopped = false;
  const ext = format === "jpeg" ? "jpg" : "png";
  const unsubscribe = cdp.on("Page.screencastFrame", params => {
    const { data, metadata, sessionId } = params;
    const file = path.join(framesDir, `frame-${String(idx++).padStart(6, "0")}.${ext}`);
    fs.writeFileSync(file, Buffer.from(data, "base64"));
    frames.push({ file, timestamp: metadata.timestamp });
    // Fire-and-forget ack -- if this throws (session already stopping), the
    // stream is ending anyway; a missed ack there cannot lose a frame that
    // matters.
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format, maxWidth, maxHeight, everyNthFrame: 1 });
  return {
    async stop() {
      if (stopped) return frames;
      stopped = true;
      await cdp.send("Page.stopScreencast").catch(() => {});
      unsubscribe();
      return frames;
    },
  };
}

function assembleVideo(frames, outPath, endTimestamp) {
  if (frames.length === 0) throw new Error("No screencast frames captured -- nothing to assemble into a video");
  const concatPath = `${outPath}.concat.txt`;
  const lines = ["ffconcat version 1.0"];
  for (let i = 0; i < frames.length; i++) {
    const cur = frames[i];
    const next = frames[i + 1];
    const nextTs = next ? next.timestamp : endTimestamp;
    // MEASURED (2026-07-22): a 50ms floor here inflated a real 11.1s run to
    // a 27s video (2.4x) -- most of the 456 captured frames arrived faster
    // than 50ms apart (real UI repaints during the connect/switch/write
    // flow), so flooring every one of those sub-50ms gaps to 50ms compounded
    // across hundreds of frames into a video whose duration had nothing to
    // do with the actual run. The floor only needs to be positive enough for
    // ffmpeg's concat demuxer to accept it, not "watchable per frame" --
    // 1ms preserves real timing; ffmpeg's own frame rate/codec handles
    // very-short-duration entries fine.
    const duration = Math.max(nextTs - cur.timestamp, 0.001);
    lines.push(`file '${cur.file}'`);
    lines.push(`duration ${duration.toFixed(3)}`);
  }
  // ffmpeg's concat demuxer ignores the duration on the FINAL entry unless a
  // file directive follows it -- repeat the last frame's path with no
  // duration line to make its preceding duration take effect.
  lines.push(`file '${frames[frames.length - 1].file}'`);
  fs.writeFileSync(concatPath, `${lines.join("\n")}\n`);

  execFileSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", concatPath, "-vsync", "vfr", "-pix_fmt", "yuv420p", outPath], {
    stdio: "inherit",
  });
  fs.rmSync(concatPath, { force: true });
}

function ffprobeDuration(videoPath) {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", videoPath],
    { encoding: "utf8" },
  ).trim();
  return parseFloat(out);
}

async function tryScrapeTxHashLink(cdp) {
  return evaluate(
    cdp,
    `(() => {
      const a = Array.from(document.querySelectorAll('a[href*="/tx/0x"]'))[0];
      return a ? a.href : null;
    })()`,
  ).catch(() => null);
}

async function take2({ outDir, cwd }) {
  const configPath = path.join(cwd, "packages", "nextjs", "scaffold.config.ts");
  const originalConfig = fs.readFileSync(configPath, "utf8");
  const NITRO = "targetNetworks: [chains.arbitrumNitro]";
  const SEPOLIA = "targetNetworks: [chains.arbitrumSepolia]";
  if (!originalConfig.includes(NITRO)) {
    throw new Error(`scaffold.config.ts: expected to find "${NITRO}" -- refusing to guess a replacement`);
  }
  fs.writeFileSync(configPath, originalConfig.replace(NITRO, SEPOLIA));
  console.log(`[take2] scaffold.config.ts switched to arbitrumSepolia`);

  const restoreConfig = () => fs.writeFileSync(configPath, originalConfig);

  const frontendPort = await findFreePort(3000);
  const frontendLogPath = path.join(outDir, "take2-frontend.log");
  const frontendLogFd = fs.openSync(frontendLogPath, "a");
  const frontend = spawn("yarn", ["workspace", "@ss/nextjs", "dev", "-p", String(frontendPort)], {
    cwd,
    stdio: ["ignore", frontendLogFd, frontendLogFd],
    detached: true,
  });
  frontend.unref();
  console.log(`[take2] frontend starting on :${frontendPort} (PID ${frontend.pid}), waiting for ready...`);

  let chrome = null;
  let disabledIds = [];
  let dappWs = null;
  const framesDir = path.join(outDir, ".take2-frames-tmp");

  try {
    await waitForHttpReady(`http://localhost:${frontendPort}`, 90000);
    console.log(`[take2] frontend ready`);

    const password = getKeychainPassword();
    const cdpPort = await findFreePort(9222);
    chrome = launchChrome({ port: cdpPort, userDataDir: path.join(os.homedir(), ".chrome-debug-profile"), headless: true });
    console.log(`[take2] Chrome launched headless, PID ${chrome.pid}, CDP port ${cdpPort}`);
    await waitForCdpReady(cdpPort);
    ({ disabledIds } = await isolateExtensions(cdpPort, METAMASK_EXTENSION_ID, chrome.pid));
    console.log(`[take2] isolated ${disabledIds.length} other extension(s)`);

    await unlock({ port: cdpPort, extensionId: METAMASK_EXTENSION_ID, password });
    console.log(`[take2] MetaMask unlocked`);

    const tabRes = await fetch(`http://127.0.0.1:${cdpPort}/json/new?${encodeURIComponent(`http://localhost:${frontendPort}/debug`)}`, {
      method: "PUT",
    });
    const tab = await tabRes.json();
    dappWs = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      dappWs.addEventListener("open", () => resolve(), { once: true });
      dappWs.addEventListener("error", err => reject(new Error(`dapp WebSocket connect failed: ${err.message}`)), { once: true });
    });
    const dappCdp = new CDP(dappWs);
    await dappCdp.send("Runtime.enable");
    await dappCdp.send("Page.enable");
    await dappCdp.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

    await waitFor(dappCdp, `!!document.querySelector('[data-testid="write-function-form-setGreeting"]')`, 30000, "debug page's setGreeting form rendered");
    console.log(`[take2] /debug page rendered`);

    const capture = await startScreencastCapture(dappCdp, framesDir, { format: "png", maxWidth: 1280, maxHeight: 800 });
    const wallStart = Date.now();
    console.log(`[take2] screencast started`);

    const alreadyConnected = await evaluate(dappCdp, `!document.querySelector('[data-testid="connect-wallet"]')`);
    if (!alreadyConnected) {
      const { accounts } = await connect({ port: cdpPort, extensionId: METAMASK_EXTENSION_ID, dappCdp });
      if (!accounts?.length) throw new Error("connect() returned no accounts");
      console.log(`[take2] connected: ${accounts[0]}`);
    } else {
      console.log(`[take2] already connected`);
    }

    await waitFor(dappCdp, `!document.querySelector('[data-testid="connect-wallet"]')`, 20000, "UI reflects connected state (connect-wallet button gone)");

    // MEASURED (2026-07-22): a fresh connect() only gets accounts -- it does
    // NOT put MetaMask on Arbitrum Sepolia. The debug profile's MetaMask
    // instance was left on whatever chain a prior session used (observed:
    // 0x1, mainnet) and the dapp rendered its "Wrong network" banner with
    // write-function-submit disabled, even though accounts were connected.
    // wallet_addEthereumChain, called the same way connect() discovers the
    // EIP-6963 provider, both adds (if missing) AND switches -- MEASURED: on
    // an already-added chain (this profile added 0x66eee during
    // cdp-with-wallet's own onboarding proof) it resolved with NO
    // confirmation popup at all, silently switching; approveTx() is still
    // raced defensively below in case a popup DOES appear (e.g. a chain not
    // yet added, or a not-yet-trusted origin), matching SKILL.md's
    // documented add-network flow.
    const switchResult = await evaluate(
      dappCdp,
      `(async () => {
        const providers = [];
        function onAnnounce(event) { providers.push(event.detail); }
        window.addEventListener("eip6963:announceProvider", onAnnounce);
        window.dispatchEvent(new Event("eip6963:requestProvider"));
        await new Promise(r => setTimeout(r, 500));
        window.removeEventListener("eip6963:announceProvider", onAnnounce);
        const match = providers.find(p => p.info?.rdns === "io.metamask");
        if (!match) return { error: "no EIP-6963 provider announced rdns=io.metamask" };
        try {
          await match.provider.request({ method: "wallet_addEthereumChain", params: [{
            chainId: "0x66eee",
            chainName: "Arbitrum Sepolia",
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: ["https://sepolia-rollup.arbitrum.io/rpc"],
            blockExplorerUrls: ["https://sepolia.arbiscan.io"],
          }] });
          return { switched: true };
        } catch (e) {
          return { error: e.message };
        }
      })()`,
    );
    if (switchResult?.error) throw new Error(`wallet_addEthereumChain failed: ${switchResult.error}`);
    console.log(`[take2] network switch result: ${JSON.stringify(switchResult)}`);
    // Best-effort: a popup only appears for a not-yet-trusted chain/origin.
    await approveTx({ port: cdpPort, extensionId: METAMASK_EXTENSION_ID, timeoutMs: 3000 }).catch(() => {});

    await waitFor(
      dappCdp,
      `!document.querySelector('[data-testid="write-function-submit"]')?.disabled`,
      20000,
      "UI reflects correct network (write-function-submit enabled)",
    );

    const newGreeting = `demo-video ${new Date().toISOString()}`;
    await evaluate(
      dappCdp,
      `(() => {
        const form = document.querySelector('[data-testid="write-function-form-setGreeting"]');
        const input = form.querySelector('[data-testid="function-input"]');
        input.focus();
        return document.activeElement === input;
      })()`,
    );
    // Input.insertText, not input.value = x -- React shadows the native
    // setter (see browser-e2e.mjs's own Common Mistakes section); this is
    // the same technique metamask.mjs uses for the exact same reason.
    await dappCdp.send("Input.insertText", { text: newGreeting });
    const clicked = await evaluate(
      dappCdp,
      `(() => {
        const form = document.querySelector('[data-testid="write-function-form-setGreeting"]');
        const btn = form.querySelector('[data-testid="write-function-submit"]');
        if (!btn || btn.disabled) return false;
        btn.click();
        return true;
      })()`,
    );
    if (!clicked) throw new Error("Could not click write-function-submit");
    console.log(`[take2] submitted setGreeting("${newGreeting}")`);

    await approveTx({ port: cdpPort, extensionId: METAMASK_EXTENSION_ID });
    console.log(`[take2] approved transaction in MetaMask`);

    const expected = JSON.stringify(newGreeting); // displayed value is JSON.stringify()'d, per browser-e2e.mjs precedent
    let txLink = null;
    const deadline = Date.now() + 60000;
    let readBack = false;
    while (Date.now() < deadline) {
      if (!txLink) txLink = await tryScrapeTxHashLink(dappCdp);
      const val = await evaluate(
        dappCdp,
        `document.querySelector('[data-testid="display-variable-greeting"] [data-testid="display-variable-value"]')?.textContent || ""`,
      ).catch(() => "");
      if (val === expected) {
        readBack = true;
        break;
      }
      await sleep(400);
    }
    if (!readBack) throw new Error(`Timed out waiting for greeting() read-back to equal ${expected}`);
    console.log(`[take2] read-back confirmed: greeting() == ${newGreeting}`);

    await sleep(1500); // let the final state settle on screen before stopping
    const frames = await capture.stop();
    const wallEnd = Date.now();
    console.log(`[take2] screencast stopped, ${frames.length} frame(s) captured`);

    const videoPath = path.join(outDir, "take2-browser-wallet-tx.mp4");
    assembleVideo(frames, videoPath, frames.length ? wallEnd / 1000 : 0);
    fs.rmSync(framesDir, { recursive: true, force: true });

    const videoDurationSeconds = ffprobeDuration(videoPath);
    const wallClockSeconds = (wallEnd - wallStart) / 1000;

    return {
      status: "PASS",
      newGreeting,
      txLink,
      videoPath,
      videoSize: fs.statSync(videoPath).size,
      videoDurationSeconds,
      wallClockSeconds,
      frameCount: frames.length,
    };
  } finally {
    if (chrome) {
      const cdpPortForTeardown = chrome.port;
      await restoreExtensions(cdpPortForTeardown, disabledIds, chrome.pid).catch(err => console.error(`[take2] restoreExtensions failed: ${err.message}`));
      await killChromeGroup(chrome.pid).catch(err => console.error(`[take2] killChromeGroup failed: ${err.message}`));
    }
    if (dappWs) {
      try {
        dappWs.close();
      } catch {
        /* already closed */
      }
    }
    try {
      process.kill(-frontend.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
    fs.rmSync(framesDir, { recursive: true, force: true });
    restoreConfig();
    console.log(`[take2] scaffold.config.ts restored, frontend (PID ${frontend.pid}) signaled to stop`);
  }
}

// ---------------------------------------------------------------------------
// Cleanup -- the Step 9f equivalent, deferred until after Take 2 (see the
// sequencing note at the top of this file). Safe to call standalone as an
// escape hatch after a crashed run.
//
// packages/nextjs/next-env.d.ts may ALREADY be dirty before this skill ever
// runs (Next.js rewrites it on its own); a blind `git checkout --` on it
// would silently discard a developer's pre-existing, unrelated change. Only
// restore files that were clean at baseline and became dirty during this
// run -- baselineDirty is captured once in main(), before take1/take2 run.
// ---------------------------------------------------------------------------
function isDirty(cwd, relPath) {
  return spawnSync("git", ["diff", "--quiet", "--", relPath], { cwd }).status !== 0;
}

function cleanupAll({ cwd, baselineDirty }) {
  console.log(`[cleanup] restoring packages/nextjs/contracts/deployedContracts.ts (Step 9f)`);
  spawnSync("git", ["checkout", "--", "packages/nextjs/contracts/deployedContracts.ts"], { cwd, stdio: "inherit" });

  for (const relPath of ["packages/nextjs/scaffold.config.ts", "packages/nextjs/next-env.d.ts"]) {
    const wasBaselineDirty = baselineDirty?.[relPath] ?? false;
    if (!wasBaselineDirty && isDirty(cwd, relPath)) {
      console.log(`[cleanup] restoring ${relPath} (was clean before this run)`);
      spawnSync("git", ["checkout", "--", relPath], { cwd, stdio: "inherit" });
    } else if (wasBaselineDirty) {
      console.log(`[cleanup] leaving ${relPath} alone -- already dirty before this run started`);
    }
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
async function main() {
  const cwd = worktreeRoot();
  const checkoutRoot = mainCheckoutRoot();
  const dateStr = new Date().toISOString().slice(0, 10);
  const outDir = process.env.DEMO_VIDEO_OUTDIR || path.join(os.homedir(), "Desktop", `stylus-demo-${dateStr}`);
  fs.mkdirSync(outDir, { recursive: true });

  const mode = process.argv[2] || "all";
  const report = { mode, outDir };

  const baselineDirty = {
    "packages/nextjs/scaffold.config.ts": isDirty(cwd, "packages/nextjs/scaffold.config.ts"),
    "packages/nextjs/next-env.d.ts": isDirty(cwd, "packages/nextjs/next-env.d.ts"),
  };

  try {
    if (mode === "take1" || mode === "all") {
      report.take1 = await take1({ outDir, cwd, checkoutRoot });
      console.log(`[main] take1: ${JSON.stringify(report.take1, null, 2)}`);
      if (mode === "all" && report.take1.status !== "PASS") {
        console.log(`[main] take1 status=${report.take1.status}, skipping take2 (nothing deployed to show)`);
      }
    }
    if (mode === "take2" || (mode === "all" && report.take1?.status === "PASS")) {
      report.take2 = await take2({ outDir, cwd });
      console.log(`[main] take2: ${JSON.stringify(report.take2, null, 2)}`);
    }
  } finally {
    if (mode === "all" || mode === "cleanup") {
      cleanupAll({ cwd, baselineDirty });
    }
  }

  console.log(`\n=== FINAL REPORT ===`);
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(`FATAL: ${err.stack || err.message}`);
    process.exit(1);
  });
}
