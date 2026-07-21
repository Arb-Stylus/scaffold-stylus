#!/usr/bin/env bash
# .claude/skills/smoke-test/preflight.sh
# Verifies environment prerequisites for the smoke test.

set -e

echo "Running smoke test preflight checks..."

# Verify standard dependencies
if ! command -v yarn &> /dev/null; then
    echo "Error: yarn is required but not installed."
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo "Error: node is required but not installed."
    exit 1
fi

echo "Preflight checks passed. Ready for smoke test."
exit 0