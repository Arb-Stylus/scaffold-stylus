#!/usr/bin/env bash
# .claude/skills/demo-video/step9.sh
#
# The ACTUAL smoke-test Step 9 procedure (9a-9e; 9f is deferred to
# record.mjs's cleanupAll(), run after Take 2 -- see the sequencing note in
# record.mjs). This is invoked by record.mjs under `asciinema record` for
# Take 1 -- it is not a parallel/demo-only script, it is Step 9 itself.
#
# Env vars expected (record.mjs sets these):
#   ACCOUNT_ADDRESS_SEPOLIA, RPC_URL_SEPOLIA, PRIVATE_KEY_SEPOLIA -- read from
#     the main checkout's packages/stylus/.env and exported into this
#     process's environment (this worktree has no .env of its own).
#   DEMO_RESULT_FILE -- path to write a small JSON result to, so record.mjs
#     can pick up status/address/txHash without parsing recorded terminal
#     output.
set -uo pipefail

write_result() {
  node -e '
    const fs = require("fs");
    fs.writeFileSync(process.env.DEMO_RESULT_FILE, JSON.stringify({
      status: process.argv[1],
      reason: process.argv[2] || null,
      address: process.env.DEMO_ADDR || null,
      txHash: process.env.DEMO_TXHASH || null,
    }, null, 2));
  ' "$1" "${2:-}"
}

echo "=== Step 9a -- tool gate (cast) ==="
if ! command -v cast >/dev/null 2>&1; then
  echo "SKIPPED -- cast (Foundry) not installed. Install: curl -L https://foundry.paradigm.xyz | bash && foundryup"
  write_result SKIPPED "cast not installed"
  exit 3
fi
cast --version

echo
echo "=== Step 9b -- credentials gate ==="
MISSING=""
[ -z "${ACCOUNT_ADDRESS_SEPOLIA:-}" ] && MISSING="$MISSING ACCOUNT_ADDRESS_SEPOLIA"
[ -z "${RPC_URL_SEPOLIA:-}" ] && MISSING="$MISSING RPC_URL_SEPOLIA"
[ -z "${PRIVATE_KEY_SEPOLIA:-}" ] && MISSING="$MISSING PRIVATE_KEY_SEPOLIA"
if [ -n "$MISSING" ]; then
  echo "SKIPPED -- Sepolia credentials not set:$MISSING"
  write_result SKIPPED "missing:$MISSING"
  exit 3
fi
echo "Credentials present (deployer: $ACCOUNT_ADDRESS_SEPOLIA)"

echo
echo "=== Step 9c -- balance gate ==="
BALANCE_WEI=$(cast balance --rpc-url "$RPC_URL_SEPOLIA" "$ACCOUNT_ADDRESS_SEPOLIA" 2>&1)
BALANCE_STATUS=$?
if [ $BALANCE_STATUS -ne 0 ]; then
  echo "SKIPPED -- Sepolia RPC unreachable: $BALANCE_WEI"
  write_result SKIPPED "RPC unreachable"
  exit 3
fi
echo "Balance: $BALANCE_WEI wei"
if [ "$BALANCE_WEI" = "0" ]; then
  echo "SKIPPED -- deployer has zero Sepolia ETH. Faucets: https://faucets.chain.link/arbitrum-sepolia"
  write_result SKIPPED "zero balance"
  exit 3
fi

echo
echo "=== Step 9d -- deploy (yarn deploy --network sepolia) ==="
# Tee, don't just run -- Step 9e needs to cross-check the PERSISTED deploy
# record (packages/stylus/deployments/421614_latest.json) against what THIS
# run's own deploy command printed. That file persists across runs; an
# "exited 0 but silently didn't rewrite it" bug would otherwise verify a
# STALE, previous deployment and still report PASS (this is the same failure
# class as reading a non-empty extension-settings directory as "vault
# initialised", or a present Keychain entry as "password correct" -- an
# artifact EXISTING is not proof it is FROM THIS RUN).
DEPLOY_LOG=$(mktemp)
yarn deploy --network sepolia | tee "$DEPLOY_LOG"
DEPLOY_STATUS=${PIPESTATUS[0]}
if [ $DEPLOY_STATUS -ne 0 ]; then
  echo "FAIL -- yarn deploy exited $DEPLOY_STATUS"
  write_result FAIL "yarn deploy exited $DEPLOY_STATUS"
  rm -f "$DEPLOY_LOG"
  exit 1
fi

echo
echo "=== Step 9e -- read back on-chain state ==="
DEPLOYMENT_JSON="packages/stylus/deployments/421614_latest.json"
export DEMO_ADDR=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$DEPLOYMENT_JSON','utf8'))['your-contract'].address)")
export DEMO_TXHASH=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$DEPLOYMENT_JSON','utf8'))['your-contract'].txHash)")

# Cross-check: the persisted file's address/tx must match what THIS
# invocation's own stdout reported (printDeployedAddresses() prints
# "Address: 0x..." / "Tx Hash: 0x..."). A mismatch (or nothing printed at
# all) means the file was NOT freshly written by this run -- FAIL, don't
# silently trust the file.
STDOUT_ADDR=$(grep -m1 "Address:" "$DEPLOY_LOG" | sed -E 's/.*Address:[[:space:]]*//')
STDOUT_TXHASH=$(grep -m1 "Tx Hash:" "$DEPLOY_LOG" | sed -E 's/.*Tx Hash:[[:space:]]*//')
rm -f "$DEPLOY_LOG"
if [ -z "$STDOUT_ADDR" ] || [ -z "$STDOUT_TXHASH" ]; then
  echo "FAIL -- could not parse Address/Tx Hash from this run's own deploy output -- refusing to trust $DEPLOYMENT_JSON without it"
  write_result FAIL "deploy stdout unparseable, cannot confirm $DEPLOYMENT_JSON is from this run"
  exit 1
fi
if [ "$STDOUT_ADDR" != "$DEMO_ADDR" ] || [ "$STDOUT_TXHASH" != "$DEMO_TXHASH" ]; then
  echo "FAIL -- $DEPLOYMENT_JSON does not match this run's own deploy output:"
  echo "  file:   address=$DEMO_ADDR txHash=$DEMO_TXHASH"
  echo "  stdout: address=$STDOUT_ADDR txHash=$STDOUT_TXHASH"
  write_result FAIL "deployment file/stdout mismatch -- file is stale, not from this run"
  exit 1
fi
echo "Deployed address: $DEMO_ADDR (cross-checked against this run's own deploy output)"
echo "Deploy tx hash:   $DEMO_TXHASH (cross-checked against this run's own deploy output)"
cast receipt "$DEMO_TXHASH" --rpc-url "$RPC_URL_SEPOLIA"
GREETING=$(cast call "$DEMO_ADDR" "greeting()(string)" --rpc-url "$RPC_URL_SEPOLIA")
OWNER=$(cast call "$DEMO_ADDR" "owner()(address)" --rpc-url "$RPC_URL_SEPOLIA")
echo "greeting(): $GREETING"
echo "owner():    $OWNER"
CODE_LEN=$(cast code "$DEMO_ADDR" --rpc-url "$RPC_URL_SEPOLIA" | wc -c | tr -d ' ')
echo "bytecode length: $CODE_LEN chars"
if [ "$CODE_LEN" -le 2 ]; then
  echo "FAIL -- deployed contract has no bytecode"
  write_result FAIL "empty bytecode at $DEMO_ADDR"
  exit 1
fi

echo
echo "PASS -- Step 9 deploy + read-back complete"
write_result PASS
exit 0
