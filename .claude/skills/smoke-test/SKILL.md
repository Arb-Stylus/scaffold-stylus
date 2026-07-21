---
name: smoke-test
description: Use when validating the main repo after phase 1 updates (update-check) are merged, to determine if phase 2 (sibling-sync) should proceed.
---

# Smoke Test (Phase 1.5)

## Overview
This skill executes the Phase 1.5 smoke test process to validate that the repository is stable after updates. It acts as the gatekeeper between the Phase 1 update and Phase 2 propagation.

**READ-ONLY CONTRACT:** This skill is STRICTLY READ-ONLY with respect to the repository source code. It runs the stack and executes tests, but it MUST NOT edit or modify any source files.

## Ordering Contract
The repository update process strictly follows this sequence:
1. `update-check` (Phase 1): Audits and upgrades the main repo.
2. Upgrades are merged.
3. **`smoke-test` (Phase 1.5)**: You are here. Validates the merged upgrades.
4. `sibling-sync` (Phase 2): Propagates updates to `create-stylus`, `create-stylus-extensions`, and `docs`.

## When to Use
- After `update-check` (Phase 1) is complete and its upgrades are merged.
- Before running `sibling-sync` (Phase 2).
- When a comprehensive smoke test of the main repo stack is requested to verify stability.

## Required Steps

The required step is (a) running the complete preflight and smoke test suite to determine a verdict. Any (b) warning, error, or failure makes the overall verdict INCONCLUSIVE.

1. **Run Preflight Checks**
   Execute the preflight script to verify environment readiness:
   ```bash
   ./.claude/skills/smoke-test/preflight.sh
   ```

2. **Execute Smoke Test**
   Run the project's standard test suite, build commands, and/or bring up the local stack to verify basic functionality. Gather all output for your verdict.

## Verdict Rules
Your final output MUST explicitly declare a verdict based on the test results.

- **PASS**: All preflight checks and smoke tests succeeded completely with no errors or warnings.
- **INCONCLUSIVE**: Any test failure, warning, script error, or inconclusive result occurred.

**Critical Gate Condition:**
Any failure or warning makes the overall verdict **INCONCLUSIVE**, not PASS. An INCONCLUSIVE verdict does **NOT** open the Phase 2 gate. Only a strict PASS allows the process to proceed to `sibling-sync`.

## Common Mistakes
- Modifying source code to fix a failing test (Remember: this skill is READ-ONLY).
- Calling the verdict PASS when there were minor warnings or ignored errors.
- Attempting to run `sibling-sync` when the verdict is INCONCLUSIVE.
