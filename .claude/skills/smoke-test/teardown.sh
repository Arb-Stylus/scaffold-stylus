#!/usr/bin/env bash
# .claude/skills/smoke-test/teardown.sh
#
# Tears down everything the smoke-test skill's Step 2 (devnode), Step 6
# (frontend), and Step 7 (browser-e2e.mjs, on a FAIL it leaves alive) start,
# and restores the one tracked file Step 4 legitimately modifies. Run from
# the repo root, same as every other step in the skill.
#
# PIDs are read from the shared state file (.smoke-state.json, written by
# launch-detached.mjs and browser-e2e.mjs) by default, since Step 2/6/7 now
# launch their processes detached from the invoking shell/session -- they
# survive that session exiting, so their PIDs cannot be trusted to live only
# in shell variables anymore. NEXTJS_PID/CHAIN_PID env vars still override
# the state file, for the documented manual escape-hatch invocation.
#
# Idempotent by design: safe to run twice, safe to run when nothing is
# alive. Killing an already-dead PID and removing an already-absent
# container both no-op quietly here — nothing in this script is allowed
# to start erroring on a repeat run. No state file (or one with no live
# PIDs) means there's simply nothing to do.
#
# Usage — on a PASS, Step 8 calls this automatically with no arguments. On
# FAIL, INCONCLUSIVE, or a crash partway through, Step 8 deliberately skips
# this call so the failure state stays alive to debug; run it by hand once
# you're done — no arguments needed (reads the state file), or with
# explicit PIDs from that run's escape-hatch output if you prefer:
#
#   .claude/skills/smoke-test/teardown.sh
#   NEXTJS_PID=<pid> CHAIN_PID=<pid> .claude/skills/smoke-test/teardown.sh

set -u

STATE_SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/state.mjs"
state_get() { node "$STATE_SCRIPT" get "$1" 2>/dev/null; }

NEXTJS_PID="${NEXTJS_PID:-$(state_get nextjsPid)}"
CHAIN_PID="${CHAIN_PID:-$(state_get chainPid)}"
CHROME_PID="$(state_get chromePid)"
CHROME_PROFILE_DIR="$(state_get chromeUserDataDir)"

# 1. Kill the Next.js dev server — the captured PID only. Never a
# pattern match (pkill -f "next dev" would sweep the whole machine and
# could kill an unrelated project's dev server — this happened live).
if [ -n "$NEXTJS_PID" ]; then
  kill "$NEXTJS_PID" 2>/dev/null
  sleep 2
  kill -9 "$NEXTJS_PID" 2>/dev/null
fi

# 2. Tear down the devnode container — names one specific container, not
# a pattern; suppressed so a second run (container already gone) doesn't
# print a docker error.
docker rm -f nitro-dev >/dev/null 2>&1 || true

# 3. Kill the backgrounded chain script if still around
if [ -n "$CHAIN_PID" ]; then
  kill "$CHAIN_PID" 2>/dev/null
fi

# 3b. Kill the Chrome instance Step 7's browser-e2e.mjs left running (only
# set in the state file when a run FAILED and left it alive for debugging;
# a PASS run cleans up its own Chrome directly). Signal the whole process
# GROUP, not just the one PID -- Chrome is multi-process (renderer/GPU/
# utility children share its pgid since it was launched detached, i.e. as
# its own group leader), and killing only the main PID would leak the rest.
if [ -n "$CHROME_PID" ]; then
  kill -TERM -- -"$CHROME_PID" 2>/dev/null
  sleep 1
  kill -KILL -- -"$CHROME_PID" 2>/dev/null
fi
[ -n "$CHROME_PROFILE_DIR" ] && rm -rf "$CHROME_PROFILE_DIR"

# 4. Remove the Step 5 scratch fixture — never let it reach git status
rm -rf packages/stylus/contracts/erc20-example

# 5. Restore the tracked file Step 4 legitimately modified
git checkout -- packages/nextjs/contracts/deployedContracts.ts 2>/dev/null || true

# 6. Remove the gitignored deployment artifacts Step 4 wrote
rm -rf packages/stylus/deployments

# 7. Verify no orphaned processes or dirty tree remain FROM THIS RUN.
# Scoped to the PIDs this run owns, not a name pattern — a pgrep -f
# "next dev" here would match any other project's dev server and
# misreport this run's teardown as failed.
echo "=== Teardown verification (expect no output below) ==="
docker ps -a --filter name=nitro-dev --format '{{.Names}}'
[ -n "$NEXTJS_PID" ] && kill -0 "$NEXTJS_PID" 2>/dev/null && echo "LEAKED: NEXTJS_PID $NEXTJS_PID still alive"
[ -n "$CHAIN_PID" ] && kill -0 "$CHAIN_PID" 2>/dev/null && echo "LEAKED: CHAIN_PID $CHAIN_PID still alive"
[ -n "$CHROME_PID" ] && kill -0 "$CHROME_PID" 2>/dev/null && echo "LEAKED: CHROME_PID $CHROME_PID still alive"
git status --porcelain -- packages/nextjs/contracts/deployedContracts.ts \
  packages/stylus/deployments packages/stylus/contracts/erc20-example
echo "=== Teardown complete ==="

# 8. Clear the state file now that everything it referenced is torn down.
node "$STATE_SCRIPT" clear 2>/dev/null || true
