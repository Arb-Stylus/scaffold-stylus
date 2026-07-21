#!/usr/bin/env bash
# .claude/skills/smoke-test/preflight.sh
#
# Preflight for the Phase 1.5 smoke-test skill. Every check here maps to a
# (b) DID NOT RUN reason in the skill's tri-state report — a failure here
# means a prerequisite is missing, NOT that the smoke test itself failed.
# This script never starts docker, deploys a contract, or touches repo
# source; it only verifies the environment is ready to attempt Step 0-8.
#
# Exit codes:
#   0  - all checks passed, safe to proceed to Step 2 (start devnode). On
#        success this script's last line of output is `FRONTEND_PORT=<port>`
#        — the caller must capture and export it for the rest of the run.
#   1  - a required tool is missing
#   2  - the consent gate (SMOKE_TEST_CONFIRM) is not set
#   5  - the deploy-credentials gate: packages/stylus/.env is missing or has
#        a blank/absent ACCOUNT_ADDRESS, RPC_URL, or PRIVATE_KEY for devnet
#   3  - the fixed RPC port (8547) is already bound. This one is NOT
#        arbitrary (see SKILL.md "DO NOT make port 8547 dynamic") so it stays
#        a hard failure.
#   4  - the working tree already has a dirty deployedContracts.ts / deployments
#        artifact, meaning a prior run leaked and was never torn down
#   6  - no free frontend port found in the probed range (3000-3019); the
#        frontend port is arbitrary so this is only hit if 20 consecutive
#        ports are all bound

set -u
FAILED=0

check_cmd() {
  local name="$1"
  local hint="$2"
  if ! command -v "$name" &>/dev/null; then
    echo "MISSING: $name — $hint"
    FAILED=1
  else
    echo "OK: $name ($(command -v "$name"))"
  fi
}

echo "=== Tool checks ==="
check_cmd node "install Node.js (repo uses Yarn Berry workspaces)"
check_cmd yarn "corepack enable or npm i -g yarn"
check_cmd docker "Docker Desktop must be installed and running"
check_cmd cast "install Foundry (curl -L https://foundry.paradigm.xyz | bash && foundryup)"
check_cmd cargo "install Rust via rustup"

if ! cargo stylus --version &>/dev/null; then
  echo "MISSING: cargo-stylus — cargo install cargo-stylus"
  FAILED=1
else
  echo "OK: cargo-stylus ($(cargo stylus --version 2>&1 | head -1))"
fi

if [ "$FAILED" -ne 0 ]; then
  echo ""
  echo "Preflight FAILED: one or more required tools are missing."
  echo "Report each missing tool's step as (b) DID NOT RUN — tool missing."
  exit 1
fi

echo ""
echo "=== Docker daemon check ==="
if ! docker info &>/dev/null; then
  echo "MISSING: docker daemon is not reachable (Docker Desktop not running?)"
  echo "Report Step 2 (start devnode) as (b) DID NOT RUN — docker daemon unreachable."
  exit 1
fi
echo "OK: docker daemon reachable"

echo ""
echo "=== Step 1a: consent gate check ==="
if [ -z "${SMOKE_TEST_CONFIRM:-}" ]; then
  echo "GATE CLOSED: SMOKE_TEST_CONFIRM is not set."
  echo "This skill starts a Docker container bound to host port 8547 plus a"
  echo "frontend dev-server port (probed from 3000), deploys throwaway"
  echo "contracts, and drives a live browser session."
  echo "Set SMOKE_TEST_CONFIRM=1 to explicitly opt in, then re-run."
  echo "Report Step 1a (consent gate) as (b) DID NOT RUN — env absent."
  exit 2
fi
echo "OK: SMOKE_TEST_CONFIRM=${SMOKE_TEST_CONFIRM}"

echo ""
echo "=== Step 1b: deploy-credentials gate check (packages/stylus/.env) ==="
# 'yarn deploy' (Step 4) reads devnet ACCOUNT_ADDRESS/RPC_URL/PRIVATE_KEY
# from this file. packages/stylus/.env.example ships the whole devnet
# block commented out, so a fresh clone has none of these set. Checked
# here, before Step 2 starts the devnode, so we don't bind ports and boot
# docker only to have 'yarn deploy' die on a missing file afterward.
#
# This check never prints the file's contents — only which of the three
# expected key names are present and non-blank — because the same file
# may also hold real sepolia/mainnet secrets in other (commented) blocks.
ENV_FILE="packages/stylus/.env"
env_key_present() {
  [ -f "$ENV_FILE" ] && grep -Eq "^${1}=[^[:space:]]" "$ENV_FILE"
}

MISSING_KEYS=""
for key in ACCOUNT_ADDRESS RPC_URL PRIVATE_KEY; do
  if ! env_key_present "$key"; then
    MISSING_KEYS="$MISSING_KEYS $key"
  fi
done

if [ -n "$MISSING_KEYS" ]; then
  echo "GATE CLOSED: ${ENV_FILE} is missing or blank for:${MISSING_KEYS}"
  echo ""
  echo "This skill will NOT create or edit ${ENV_FILE} for you, and will"
  echo "NOT invent or guess values. Paste this block into ${ENV_FILE}"
  echo "(create the file if it doesn't exist) — these are the"
  echo "nitro-devnode's own well-known prefunded dev values, hardcoded in"
  echo "plaintext at nitro-devnode/run-dev-node.sh line 7, not a secret:"
  echo ""
  cat <<'BLOCK'
DEPLOYMENT_DIR=deployments

## devnet
ACCOUNT_ADDRESS=0x3f1Eae7D46d88F08fc2F8ed27FCb2AB183EB2d0E
RPC_URL=http://127.0.0.1:8547
PRIVATE_KEY=0xb6b15c8cb491557369f3c7d2c287b053eb229daa9c22138887752191c9520659
BLOCK
  echo ""
  echo "Report Step 1b (deploy-credentials gate) as (b) DID NOT RUN — env absent."
  exit 5
fi
echo "OK: ${ENV_FILE} has non-blank ACCOUNT_ADDRESS/RPC_URL/PRIVATE_KEY"

echo ""
echo "=== RPC port check (8547, fixed — not arbitrary) ==="
if lsof -i ":8547" -sTCP:LISTEN &>/dev/null; then
  echo "BUSY: port 8547 is already bound — a leaked devnode from a prior"
  echo "smoke-test run is the most likely cause (check for an orphaned"
  echo "'nitro-dev' container before retrying)."
  FAILED=3
else
  echo "OK: port 8547 free"
fi

if [ "$FAILED" -ne 0 ]; then
  echo ""
  echo "Preflight FAILED: report the blocked step as (b) DID NOT RUN — port busy."
  exit 3
fi

echo ""
echo "=== Frontend port probe (3000+, arbitrary — first free port wins) ==="
# The frontend port is not fixed like 8547 (see the RPC port check above),
# so a busy 3000 is not a hard failure: probe upward for the first free
# port instead of aborting. But a busy 3000 is often a dev server LEAKED
# from a prior run of THIS skill (Step 8 teardown failed to kill it) —
# silently sliding past it to 3001 would hide that signal and let leaks
# pile up run after run. So for every occupied port we skip, name what
# holds it (PID + full command) before moving on. We never kill it here —
# only report it. A holder belonging to another project's dev server is
# fine and expected; a holder that is this repo's own `next dev` is a
# leak worth investigating.
FRONTEND_PORT=""
for offset in $(seq 0 19); do
  candidate=$((3000 + offset))
  holder_pid=$(lsof -nP -iTCP:"${candidate}" -sTCP:LISTEN -t 2>/dev/null | head -1)
  if [ -z "$holder_pid" ]; then
    FRONTEND_PORT="$candidate"
    break
  fi
  holder_cmd=$(ps -p "$holder_pid" -o command= 2>/dev/null)
  echo "port ${candidate} busy: PID ${holder_pid} ${holder_cmd}"
done

if [ -z "$FRONTEND_PORT" ]; then
  echo "BUSY: no free port found in range 3000-3019 for the frontend."
  echo "Report the blocked step as (b) DID NOT RUN — no free frontend port."
  exit 6
fi

echo ""
echo ">>> Chosen frontend port: FRONTEND_PORT=${FRONTEND_PORT} <<<"

echo ""
echo "=== Working tree cleanliness check ==="
DIRTY=$(git status --porcelain -- packages/nextjs/contracts/deployedContracts.ts packages/stylus/deployments packages/stylus/contracts/erc20-example 2>/dev/null)
if [ -n "$DIRTY" ]; then
  echo "DIRTY: a previous smoke-test run left artifacts uncleaned:"
  echo "$DIRTY"
  echo "This means a prior run's Step 8 teardown did not complete. Clean it"
  echo "manually (git checkout -- packages/nextjs/contracts/deployedContracts.ts;"
  echo "rm -rf packages/stylus/deployments packages/stylus/contracts/erc20-example)"
  echo "before treating this run's results as trustworthy."
  exit 4
fi
echo "OK: no leaked artifacts from a prior run"

echo ""
echo "=== Leaked run-state check ==="
# Step 2/6/7 launch their processes (devnode, frontend, and on a FAIL,
# Chrome) fully detached from the invoking shell/session, so they can
# outlive it -- see launch-detached.mjs. .smoke-state.json is the durable
# record of that. A leftover file here is the same class of problem as the
# dirty-tree check above: a prior run's Step 8 never ran (or never got the
# chance to). Surfacing it directly is more useful than waiting for the
# symptom (a busy port) to show up further down.
STATE_FILE=".claude/skills/smoke-test/.smoke-state.json"
if [ -f "$STATE_FILE" ]; then
  echo "DIRTY: a previous smoke-test run's state file is still present:"
  cat "$STATE_FILE"
  echo "This means a prior run's Step 8 teardown did not run (FAIL/"
  echo "INCONCLUSIVE/crash) or was never followed up by hand. Run"
  echo "'.claude/skills/smoke-test/teardown.sh' (no arguments needed -- it"
  echo "reads this same file) before treating this run's results as"
  echo "trustworthy."
  exit 4
fi
echo "OK: no leaked run-state file from a prior run"

echo ""
echo "Preflight PASSED. Safe to proceed to Step 2 (start devnode)."
echo "FRONTEND_PORT=${FRONTEND_PORT}"
exit 0
