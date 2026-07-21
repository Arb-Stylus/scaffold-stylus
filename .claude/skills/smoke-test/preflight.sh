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
#   0  - all checks passed, safe to proceed to Step 2 (start devnode)
#   1  - a required tool is missing
#   2  - the consent gate (SMOKE_TEST_CONFIRM) is not set
#   5  - the deploy-credentials gate: packages/stylus/.env is missing or has
#        a blank/absent ACCOUNT_ADDRESS, RPC_URL, or PRIVATE_KEY for devnet
#   3  - a required port (8547 or 3000) is already bound
#   4  - the working tree already has a dirty deployedContracts.ts / deployments
#        artifact, meaning a prior run leaked and was never torn down

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
  echo "This skill starts a Docker container bound to host ports 8547/3000,"
  echo "deploys throwaway contracts, and drives a live browser session."
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
echo "=== Port checks ==="
for port in 8547 3000; do
  if lsof -i ":${port}" -sTCP:LISTEN &>/dev/null; then
    echo "BUSY: port ${port} is already bound — a leaked devnode/dev-server"
    echo "from a prior smoke-test run is the most likely cause (check for an"
    echo "orphaned 'nitro-dev' container or 'next dev' process before retrying)."
    FAILED=3
  else
    echo "OK: port ${port} free"
  fi
done

if [ "$FAILED" -ne 0 ]; then
  echo ""
  echo "Preflight FAILED: report the blocked step as (b) DID NOT RUN — port busy."
  exit 3
fi

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
echo "Preflight PASSED. Safe to proceed to Step 2 (start devnode)."
exit 0
