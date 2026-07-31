export const meta = {
  name: 'sibling-sync-phase2',
  description: 'Phase 2 — verify and update siblings after the main scaffold repo has been updated and merged',
  whenToUse: 'Only after phase 1 (update-check) is green AND its PRs are merged to main. Aborts if phase-1 is not merged. npm publish state is reported as a create-stylus finding, not a gate.',
  phases: [
    { title: 'Gate', detail: 'confirm phase-1 changes are merged to main — abort if not; publish state is reported, not gated' },
    { title: 'Verify', detail: 'parallel: create-stylus propagation, extension overlays, docs accuracy' },
    { title: 'Report', detail: 'per-sibling plan, propagation failures first' },
  ],
}

const PREAMBLE = `Resolve the MAIN repo path yourself:
  git rev-parse --show-toplevel
Siblings live alongside it. Derive the GitHub org from 'git remote get-url origin' rather than assuming.
Do NOT hardcode any absolute path.

READ-ONLY. Do not edit, commit, publish, or upgrade anything in any repo. Report only.`

const MODE_DISCOVERY = `STEP 0 — DECIDE THE MODE. Do this FIRST; it determines what the rest of your work is.

Ask: does this sibling have WORKING automation that propagates changes from the main repo?
Answer with EVIDENCE, never by assumption and never from a filename:
  - ls the repo's .github/workflows/ (or confirm .github/ does not exist at all)
  - for each relevant workflow: gh run list --workflow <file> --limit 5 --json conclusion,createdAt
  - does its trigger still RESOLVE? A workflow triggering on a branch that was deleted never fires again.
    Check with: git ls-remote --heads origin <trigger-branch>
  - did it run AFTER the main repo's most recent relevant merge, and did it CONCLUDE success?

A workflow FILE existing is NOT proof of working automation. Zero runs, or a last run predating the merge you
care about, or a dead trigger, all mean the automation is NOT doing the job.

Then set mode:
  mode = "check"  -> working automation exists. Your job is ONLY to verify it actually ran and actually carried
                     the right CONTENT. Do not re-specify work the automation already does.
  mode = "update" -> no automation, or it is broken/dead/stale. Your job is to specify the CONCRETE UPDATE:
                     exactly which files must change, to what, and why. Be specific enough that someone can
                     execute it without re-deriving your analysis. Name real paths and real values.

Record your evidence in the "automation" field. If a sibling you expected to be automated turns out NOT to be,
that is a BLOCKER finding in its own right, separate from whatever content is stale.

`

const HONESTY = `
SCANNER HONESTY — classify EVERY result as exactly one of these, and never conflate them:
  (a) check RAN and is clean
  (b) check DID NOT RUN — tool missing, permission denied, endpoint failed, repo unreachable
  (c) issue found but NOT actually reachable by users
State (b) explicitly with severity "unchecked". A sibling you could not verify is UNCHECKED, not passing.
Absence of a red signal is not presence of a green one.`

const RESULT = {
  type: 'object', additionalProperties: false, required: ['sibling', 'status', 'mode', 'findings'],
  properties: {
    sibling: { type: 'string' },
    status: { enum: ['in-sync', 'needs-update', 'broken', 'unchecked'] },
    mode: { enum: ['check', 'update'], description: 'Set per MODE_DISCOVERY — check (working automation exists) or update (no automation, or broken/dead/stale)' },
    findings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['title', 'severity', 'evidence', 'reaches_users', 'action'],
        properties: {
          title: { type: 'string' },
          severity: { enum: ['blocker', 'needs-update', 'nice-to-have', 'informational', 'unchecked'] },
          evidence: { type: 'string', description: 'Actual command output or file content proving this — not an inference' },
          reaches_users: { type: 'string', description: 'How and how fast this reaches an end user, or "does not"' },
          action: { type: 'string' },
        },
      },
    },
  },
}

// ---------------------------------------------------------------------------
// Phase 2 is meaningless on an unmerged base.
// ---------------------------------------------------------------------------

phase('Gate')

const GATE = {
  type: 'object', additionalProperties: false, required: ['ready', 'reason', 'mainVersion', 'npmVersion', 'releasePublished'],
  properties: {
    ready: { type: 'boolean' },
    reason: { type: 'string', description: 'If not ready, exactly what is missing' },
    mainVersion: { type: 'string' },
    npmVersion: { type: 'string' },
    releasePublished: { type: 'boolean', description: 'true only if create-stylus was actually published to npm at the main version (npm dist-tag == main package.json version)' },
  },
}

const gate = await agent(
  `${PREAMBLE}

Determine whether PHASE 1 IS MERGED TO MAIN, so phase 2 can safely run. Be strict — a false "ready" wastes the
whole run. Readiness is about git state ONLY — npm publish success is a SEPARATE, non-gating finding (see below).

Check and report ACTUAL output:
1. git status -sb on the main repo — is main clean and in sync with origin/main?
2. gh pr list --state open — are there still open PRs carrying phase-1 work (dependency, gitignore, devnode, or
   security fixes)? Unmerged phase-1 work means NOT ready.
3. git log origin/main --oneline -10 — did the phase-1 changes actually land on main?
4. The version in the main repo's package.json.
5. npm view create-stylus version — the published version.
6. gh run list --workflow release-create-stylus.yaml --limit 3 — did the release pipeline run and SUCCEED after
   the most recent merge? Read the conclusion, do not assume.

ready = true ONLY if: main is clean and synced with origin/main, no phase-1 PR is still open, and the phase-1
changes are visibly on origin/main. Do NOT factor npm publish success into ready — a merged-but-unpublished
release is still a ready base for phase 2 (create-stylus-extensions and docs do not depend on npm at all).

releasePublished = true ONLY if 'npm view create-stylus version' equals the main repo's package.json version
AND the release-create-stylus.yaml run after the last merge concluded success. Otherwise releasePublished =
false — explain exactly why in the reason (e.g. "npm still shows 0.1.17 vs main's 0.2.0, release run concluded
failure/E404").
${HONESTY}`,
  { label: 'gate:phase1-ready', phase: 'Gate', schema: GATE }
)

if (!gate || !gate.ready) {
  log(`ABORTED — phase 1 is not done: ${gate ? gate.reason : 'gate check returned nothing'}`)
  return {
    aborted: true,
    reason: gate ? gate.reason : 'gate check returned nothing',
    hint: 'Finish and merge phase 1 (update-check) first. Do not work around this gate.',
    gate,
  }
}

log(`Gate passed — main ${gate.mainVersion}, npm ${gate.npmVersion}, releasePublished=${gate.releasePublished}. Proceeding to siblings.`)

// ---------------------------------------------------------------------------
// Each sibling receives changes by a DIFFERENT mechanism, so each gets a
// different check. Do not collapse these into one generic "is it updated" pass.
// ---------------------------------------------------------------------------

phase('Verify')

const SIBLINGS = [
  {
    key: 'create-stylus',
    prompt: `${PREAMBLE}

${MODE_DISCOVERY}
Sibling: create-stylus. It receives changes AUTOMATICALLY — merging to the main repo's main branch rsyncs the
repo into create-stylus/templates/base and then runs 'npm publish'. Your job is to verify the propagation
actually happened and carried the right content, NOT merely that the workflow reported success.

GATE CONTEXT: releasePublished=${gate.releasePublished} (main repo version ${gate.mainVersion}, npm version
${gate.npmVersion}). If releasePublished is false, you MUST report a BLOCKER finding titled
"create-stylus@${gate.mainVersion} not on npm — publish failed, users still get the old version", with the
gate's reason as evidence and 'npx create-stylus' currently resolving to an older version as reaches_users.
Report this in ADDITION to, not instead of, the git-level propagation checks below — a repo can be perfectly
rsynced and still unpublished.

1. PROPAGATION IS REAL. Pick several files that phase 1 changed in the main repo and diff them against the
   same paths under create-stylus templates/base (use the local clone if present, otherwise gh api to read the
   file). Report concrete content differences, not "looks synced".

2. NOTHING LEAKED. The rsync excludes .claude/ and .worktrees/, but verify against the ACTUAL PUBLISHED
   PACKAGE rather than the exclude list — the exclude list is a claim, the tarball is the evidence:
     npm pack create-stylus@latest --dry-run --json    (or download and list the tarball contents)
   Confirm NO .claude/, .worktrees/, .git/, or other maintainer tooling is present. If any is, that is a
   BLOCKER — it means the exclusions do not work and maintainer files are on every user's disk.

3. VERSION PARITY. main repo package.json vs create-stylus main package.json vs 'npm view create-stylus version'
   and the dist-tags. All three should agree.

4. STALE CONTENT. Is templates/base missing anything the main repo has, or carrying anything the main repo
   deleted? Deletions are the common miss — rsync --delete should handle it, verify it did.

For each finding say how and how fast it reaches an end user: create-stylus is npm-published, so a bad sync
reaches anyone running 'npx create-stylus' after the publish.
${HONESTY}`,
  },
  {
    key: 'create-stylus-extensions',
    prompt: `${PREAMBLE}

${MODE_DISCOVERY}
Sibling: create-stylus-extensions. This one is the URGENT one. Extensions are NOT npm published — each
extension is a branch whose overlay is fetched AT SCAFFOLD TIME. So a broken overlay reaches users
IMMEDIATELY, with no publish step in between and no version to pin back to.

Also note: this repo has NO CI at all (no .github/). Verify that claim yourself. If true, your check is the
only gate that exists.

1. ENUMERATE the extension branches: gh api repos/{org}/create-stylus-extensions/branches --paginate
   (derive {org} from the main repo's remote). List every extension branch and when it was last updated.

2. OVERLAY COMPATIBILITY WITH THE NEW BASE. This is the core question. For each extension, determine whether
   its overlay still applies cleanly to the UPDATED base:
   - which files does the overlay replace or add?
   - do those files still exist in the new base with a compatible shape?
   - does the overlay reference anything phase 1 changed (paths, versions, config keys, deploy script
     structure, workspace layout)?
   A file the overlay overwrites that the base has since RESTRUCTURED is the classic silent break.

3. KNOWN CONTEXT you must respect: chainlink-data-feed is INTENTIONALLY frontend-only — it reads an existing
   on-chain feed via externalContracts.ts and has no contract of its own. Its deploy script is a deliberate
   no-op. Do NOT report that as broken.

4. STALENESS. Any extension branch far behind the base is a risk even if it still applies. Report age.

Prefer real evidence: read the actual overlay files and the actual base files and compare. Do not infer from
branch names or commit messages.
${HONESTY}`,
  },
  {
    key: 'scaffold-stylus-docs',
    prompt: `${PREAMBLE}

${MODE_DISCOVERY}
Sibling: scaffold-stylus-docs. It receives changes MANUALLY — nobody syncs it, so it drifts silently. It has
NO PR-level CI (verify this), so nothing catches inaccuracy.

Your job: find places where the docs now describe behaviour the code no longer has.

1. VERSION AND COMMAND ACCURACY. Grep the docs for version numbers and shell commands (cargo-stylus versions,
   node/yarn/npm commands, rust toolchain versions, install instructions) and check each against what the main
   repo actually specifies now. A documented version that no longer matches the repo is a finding.

2. PHASE 1 CHANGES REFLECTED. Whatever phase 1 changed in the main repo — determine whether the docs needed to
   change too, and whether they did. Read the main repo's recent main-branch commits to know what changed.

3. NEW BEHAVIOUR UNDOCUMENTED. Anything the scaffold now does that the docs never mention. Prior known gap:
   the ArbOS 60 / nitro-node v3.11.0 devnode requirement for contracts over 24KB — check whether that is now
   documented (a PR may have landed it) rather than assuming either way.

4. INSTRUCTIONS THAT WOULD NOW FAIL. The highest-value finding: a documented command that would error if a user
   copy-pasted it today. Check install steps and deploy steps especially.

Distinguish clearly between docs that are WRONG (would mislead or break a user) and docs that are merely
INCOMPLETE. Only the first is urgent.
${HONESTY}`,
  },
]

const results = (await parallel(
  SIBLINGS.map((s) => () =>
    agent(s.prompt, { label: `sibling:${s.key}`, phase: 'Verify', schema: RESULT })
  )
)).filter(Boolean)

if (results.length < SIBLINGS.length) {
  log(`WARNING: ${SIBLINGS.length - results.length} sibling(s) returned nothing — coverage incomplete`)
}

phase('Report')

const report = await agent(
  `Synthesize a phase-2 sibling report. Base state: main repo ${gate.mainVersion}, npm ${gate.npmVersion},
releasePublished=${gate.releasePublished} (${gate.reason}).

${JSON.stringify(results, null, 2)}

Produce a decision-ready report:
1. One-sentence verdict per sibling: in-sync / needs-update / broken / unchecked.
2. THE MODE per sibling — "check" (working automation, only verified) or "update" (no automation, or
   broken/dead/stale, so a concrete update was specified). Report this alongside the verdict; a sibling in
   "update" mode with no findings is a contradiction, flag it.
3. PROPAGATION FAILURES FIRST — anything where the main repo's changes did not actually reach a sibling. These
   outrank everything else, because they mean the phase-1 work is not live even though it merged.
4. Then rank by HOW FAST IT REACHES USERS, not by tidiness:
   - create-stylus-extensions overlays reach users IMMEDIATELY (fetched at scaffold time, no publish, no pin)
   - create-stylus reaches users on the next npm publish
   - docs mislead users but do not break builds
5. Any leaked maintainer file in the published npm package is a BLOCKER regardless of other severity.
6. If releasePublished is false, the create-stylus verdict MUST reflect the npm-publish BLOCKER finding — do not
   let it read as in-sync just because the git-level rsync is clean. extensions and docs verdicts are
   INDEPENDENT of releasePublished — they do not depend on npm at all, so do not downgrade them for this.
7. List explicitly what was verified CLEAN and what was UNCHECKED. Never let an unchecked sibling read as passing.
8. For each action, say whether it is a CODE change (needs to be delegated as a separate task) or an OPS action.

Be blunt. If the siblings are genuinely in sync, say so plainly and do not manufacture work.`,
  { label: 'synthesize', phase: 'Report', schema: RESULT }
)

return { phase: 2, gate, siblings: results.map((r) => ({ sibling: r.sibling, status: r.status, mode: r.mode })), report }
