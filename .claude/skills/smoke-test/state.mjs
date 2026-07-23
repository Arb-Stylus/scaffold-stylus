#!/usr/bin/env node
// .claude/skills/smoke-test/state.mjs
//
// Shared state store for the smoke-test skill. Step 2 (devnode) and Step 6
// (frontend) launch their processes detached from the invoking shell/session
// via launch-detached.sh, so they survive the session that started them --
// which means their PIDs can no longer be trusted to live only in that
// shell's variables. This file is the durable record Step 8's teardown (and
// a human's escape hatch) reads instead. Step 7's browser-e2e.mjs uses the
// same file to record the Chrome it launches.
//
// CLI usage:
//   node state.mjs set <key> <value>
//   node state.mjs get <key>          # prints value, nothing if absent
//   node state.mjs unset <key>
//   node state.mjs dump               # pretty-prints the whole file
//   node state.mjs clear              # deletes the state file entirely
//
// Library usage (imported directly by browser-e2e.mjs):
//   import { readState, setState, unsetState, clearState } from "./state.mjs"

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const STATE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), ".smoke-state.json");

export function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  } catch {
    return {};
  }
}

export function writeState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n");
}

export function setState(key, value) {
  const state = readState();
  state[key] = value;
  writeState(state);
}

export function unsetState(key) {
  const state = readState();
  delete state[key];
  writeState(state);
}

export function clearState() {
  fs.rmSync(STATE_PATH, { force: true });
}

function main() {
  const [, , cmd, ...args] = process.argv;
  switch (cmd) {
    case "set": {
      const [key, value] = args;
      if (!key) throw new Error("usage: state.mjs set <key> <value>");
      setState(key, value ?? "");
      break;
    }
    case "get": {
      const [key] = args;
      const value = readState()[key];
      if (value !== undefined) process.stdout.write(String(value));
      break;
    }
    case "unset": {
      const [key] = args;
      unsetState(key);
      break;
    }
    case "dump":
      console.log(JSON.stringify(readState(), null, 2));
      break;
    case "clear":
      clearState();
      break;
    default:
      console.error("usage: state.mjs <set|get|unset|dump|clear> [args]");
      process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
