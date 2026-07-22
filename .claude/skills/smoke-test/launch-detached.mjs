#!/usr/bin/env node
// .claude/skills/smoke-test/launch-detached.mjs
//
// Launch a command detached from the invoking shell/session, so it survives
// that session exiting. Without this, Step 2 (devnode) and Step 6 (frontend)
// were plain `cmd &` background jobs that die with the process group of
// whatever session started them -- e.g. the invoking shell or session being
// closed -- which made Step 8's FAIL-path escape hatch print PIDs that were
// already dead by the time a human read them.
//
// Uses Node's `detached` spawn option rather than shelling out to the
// `setsid` CLI binary: libuv calls setsid(2) directly on POSIX platforms
// when detached is set, and this works identically on macOS and Linux --
// unlike `setsid(1)`, which ships with util-linux and is NOT present on
// macOS by default.
//
// Prints exactly the resulting PID to stdout on success (nothing else), so
// callers can do: PID=$(node launch-detached.mjs logfile.log some-command args...)
//
// Usage: node launch-detached.mjs <logfile> <command> [args...]

import { spawn } from "node:child_process";
import fs from "node:fs";

const [, , logfile, cmd, ...args] = process.argv;

if (!logfile || !cmd) {
  console.error("usage: launch-detached.mjs <logfile> <command> [args...]");
  process.exit(1);
}

const out = fs.openSync(logfile, "a");
const child = spawn(cmd, args, {
  detached: true,
  stdio: ["ignore", out, out],
});

child.on("error", err => {
  console.error(`ERROR: failed to launch ${cmd}: ${err.message}`);
  process.exit(1);
});

// Give a synchronous spawn error (e.g. ENOENT) a tick to surface via the
// error handler above before we report a PID that never actually ran.
setImmediate(() => {
  if (child.exitCode !== null || child.signalCode !== null) {
    console.error(`ERROR: ${cmd} exited immediately (code=${child.exitCode} signal=${child.signalCode})`);
    process.exit(1);
  }
  child.unref();
  process.stdout.write(String(child.pid));
});
