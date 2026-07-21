#!/usr/bin/env bash
# .claude/skills/smoke-test/teardown.sh
#
# Tears down everything the smoke-test skill's Step 2 (devnode) and Step 6
# (frontend) start, and restores the one tracked file Step 4 legitimately
# modifies. Run from the repo root, same as every other step in the skill.
#
# Idempotent by design: safe to run twice, safe to run when nothing is
# alive. Killing an already-dead PID and removing an already-absent
# container both no-op quietly here — nothing in this script is allowed
# to start erroring on a repeat run.
#
# Usage — on a PASS, Step 8 calls this automatically. On FAIL,
# INCONCLUSIVE, or a crash partway through, Step 8 deliberately skips this
# call so the failure state stays alive to debug; run it by hand once
# you're done, with the PIDs from that run's escape-hatch output:
#
#   NEXTJS_PID=<pid> CHAIN_PID=<pid> .claude/skills/smoke-test/teardown.sh

set -u

NEXTJS_PID="${NEXTJS_PID:-}"
CHAIN_PID="${CHAIN_PID:-}"

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
git status --porcelain -- packages/nextjs/contracts/deployedContracts.ts \
  packages/stylus/deployments packages/stylus/contracts/erc20-example
echo "=== Teardown complete ==="
