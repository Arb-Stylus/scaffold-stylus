export const meta = {
  name: 'dependency-check-phase1',
  description: 'Phase 1 — audit the main scaffold project for dependency updates: Rust/Stylus, frontend, security, UI + upstream parity',
  whenToUse: 'Before a release, when resuming after time away, or whenever asked whether dependencies need updating. Main repo only; siblings are phase 2.',
  phases: [
    { title: 'Scan', detail: 'parallel: rust-stylus, frontend-deps, security, ui-se2-parity' },
    { title: 'Report', detail: 'merge into one security-first ranked upgrade plan' },
  ],
}

// ---------------------------------------------------------------------------
// Portability: no absolute paths. Every agent resolves the repo itself.
// ---------------------------------------------------------------------------

const ROOT_CMD = 'git rev-parse --show-toplevel'

const PREAMBLE = `You are auditing the MAIN scaffold repository. Resolve its path yourself by running:
  ${ROOT_CMD}
Use that as the repo root for every path below. Do NOT assume any absolute path.

SCOPE — this repo ONLY. Sibling repos (create-stylus, create-stylus-extensions, the docs site) are phase 2 and
are explicitly OUT OF SCOPE. Do not read, clone, or report on them.

READ-ONLY — do not edit files, do not commit, do not upgrade anything, and do not run any command that would
rewrite a lockfile. If the only way to gather a data point would mutate a file, skip it and say why.`

const VERIFIED_BASELINE = `
VERIFIED BASELINE — last confirmed 2026-07-21. Treat these as established facts, not open questions to
re-derive. On every run: check whether anything below has actually changed; if so, update this block (bump the
verification date) and report the change as a finding. If nothing has changed, DIFF against these numbers —
re-confirm briefly, don't re-litigate them from scratch as if they were unknown.
- openzeppelin-stylus 0.3.0 is still the latest release (shipped 2025-09-10, ~10 months old as of this date). OZ's
  main branch still pins stylus-sdk "=0.9.0" and alloy "=0.8.20". The host-target VM mismatch (0.3.0/0.9.0) has
  NO upstream fix yet.
- The tailwind v3->v4 and daisyui v4->v5 migrations already LANDED (PR #67, merged 2026-06-09). Do not re-propose
  them as pending work — just verify they are still applied.
- wagmi 3.x is BLOCKED: no rainbowkit 3.x release exists, burner-connector hard-depends on wagmi 2.19.5, and
  wagmi 3 requires typescript >=5.9.3 while this repo resolves 5.9.2.
- Exactly ONE Stylus contract exists in this repo: packages/stylus/contracts/your-contract. On rustc 1.89.0 it
  measures 20,756 bytes compressed against the 24,576-byte multi-fragment threshold. Re-measure and report the
  delta from 20,756, not a bare fresh number treated as if no prior baseline existed.
Whoever edits this block on a future run MUST replace the verification date above with the date of that run.`

const CONSTRAINTS = `
KNOWN CONSTRAINTS — a recommendation that violates any of these is WRONG, not a finding:
- rust-toolchain.toml pins channel "1.89.0". EVERY cargo-stylus release from 0.10.3 up requires rustc >= 1.91.0.
  So bumping cargo-stylus REQUIRES a rust-toolchain migration. Report it as COUPLED work, never a simple bump.
- NEVER run 'cargo generate-lockfile'. parity-scale-codec is pinned at 3.7.5; the CI gate is
  'cargo metadata --locked'.
- Plain 'cargo build' on the HOST target FAILS due to an openzeppelin-stylus 0.3.0 / stylus-sdk 0.9.0 VM
  mismatch. EXPECTED and pre-existing. 'cargo stylus check' and the wasm target pass. Do NOT report it as a bug.
- The rust-toolchain pin is tied to OpenZeppelin requirements and CONTRACT SIZE limits
  (OpenZeppelin/rust-contracts-stylus issue #129). A different rustc changes wasm codegen, which changes contract
  size; contracts over 24KB become multi-fragment and need ArbOS 60 to activate. Size is load-bearing.
- Merging to main auto-publishes create-stylus to npm. Anything landed ships to users immediately.
- NEVER infer a PR's or branch's actual content from its NAME. A branch called "chore/cargo-stylus-0.10.8" may
  not actually bump anything to 0.10.8 — names can be stale, aspirational, or left over from a renamed or
  reworked change. Before reporting what a PR or branch changes, read the REAL diff
  ('git diff origin/main...<branch>' or 'gh pr diff <number>') and quote the version numbers you actually found
  in it. A claim about PR/branch contents that is not backed by a diff you personally read is a guess, not a
  finding — do not report it as one, and do not recommend splitting or altering a PR based on what its name
  implies.
- A VERSION GAP IS NOT A FINDING — THE CHANGELOG IS. Reporting "current X, latest Y" is an observation, not a
  finding. For ANY gap you report, read the release notes for EVERY intervening version, not just the newest,
  and state what actually changed and whether it affects THIS project. A report of bare version numbers has
  FAILED and must be treated as incomplete.
${VERIFIED_BASELINE}

Do NOT recommend an upgrade merely because a newer version exists. Recommend only when the delta fixes a real
problem or closes a security gap, and state what would break.`

const FINDINGS = {
  type: 'object', additionalProperties: false, required: ['summary', 'findings'],
  properties: {
    summary: { type: 'string', description: 'One sentence: does this area need action?' },
    findings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['name', 'current', 'latest', 'severity', 'coupling', 'payoff', 'risk', 'action'],
        properties: {
          name: { type: 'string' },
          current: { type: 'string', description: 'Version actually pinned in this repo, as read from the file' },
          latest: { type: 'string', description: 'Latest upstream release, or "n/a"' },
          severity: { enum: ['security-critical', 'security-moderate', 'should-update', 'optional', 'blocked', 'up-to-date', 'unchecked'] },
          coupling: { enum: ['independent', 'coupled', 'n/a'], description: '"coupled" if it forces another change' },
          payoff: { type: 'string', description: 'What updating concretely gains. "none" if cosmetic.' },
          risk: { type: 'string', description: 'What could break; name the specific breaking change if any' },
          action: { type: 'string', description: 'Concrete next step, or "none"' },
        },
      },
    },
  },
}

const TOOL_TRAPS = `
TOOL TRAPS — each of these has produced a wrong result on a real run. The consequence is stated, not just the
instruction, because an instruction without its consequence gets skipped:
- 'gh api ... --paginate' is MANDATORY on the Dependabot alerts endpoint. Measured on a sibling repo: 25 alerts
  without --paginate vs 29 with it. Omitting it silently UNDER-REPORTS, and the missing alerts look like a clean
  result instead of a gap.
- 'gh release list' sorts by DATE, not by "latest stable" — a pre-release published after the last stable tag
  sorts ABOVE it. Use '--exclude-pre-releases', or you will report a pre-release as the current latest version.
- 'npm view <pkg> version' returns the latest dist-tag, which can LAG the newest published version. Do not treat
  it as ground truth for "is there something newer".
- A wrong GitHub org/repo in a query FAILS in a way that is INDISTINGUISHABLE from "no alerts found". Verify the
  org/repo you resolved from 'git remote get-url origin' before trusting a clean result.
- The GitHub dependency graph can be UNPOPULATED while Dependabot alerts are enabled. When that happens, the
  alerts endpoint returns [] and 'GET /repos/{owner}/{repo}/dependency-graph/sbom' 404s. An empty alerts
  response in that state is an ARTIFACT of an unpopulated graph, not a clean result — confirm the SBOM endpoint
  returns 200 before trusting an empty alerts list. Proof this matters: discovered on the 2026-07-21 run, this
  repo's tree provably contains postcss 8.4.31 (GHSA-qx2v-qp2m-jg93), which Dependabot should have flagged and
  did not.`

const SYNTHESIS_FINDINGS = {
  type: 'object', additionalProperties: false, required: ['summary', 'findings', 'notRunOrUnchecked'],
  properties: {
    summary: FINDINGS.properties.summary,
    findings: FINDINGS.properties.findings,
    notRunOrUnchecked: {
      type: 'array',
      items: { type: 'string' },
      description: 'MANDATORY first-class section: every scanner, tool, or data source that did NOT execute or '
        + 'could not be verified this run (e.g. "cargo-audit not installed", "GitHub dependency graph '
        + 'unpopulated"). Never fold these into findings or omit them. Empty array ONLY if every planned check '
        + 'genuinely ran.',
    },
  },
}

const DIMENSIONS = [
  {
    key: 'rust-stylus',
    prompt: `${PREAMBLE}

Audit the Rust/Stylus dependency stack.

Read the ACTUAL pinned versions first — never assume:
  packages/stylus/contracts/*/Cargo.toml
  packages/stylus/contracts/rust-toolchain.toml
  readme.md and .github/workflows/*.yaml  (for the cargo-stylus version, which appears in several places)

For EACH of stylus-sdk, openzeppelin-stylus, alloy-primitives, alloy-sol-types, cargo-stylus, and the rust
toolchain channel: find the latest upstream release and how far behind we are. Use
  cargo search <name> --limit 1
  gh release list --repo OffchainLabs/stylus-sdk-rs
  gh release list --repo OpenZeppelin/rust-contracts-stylus
  gh release list --repo OffchainLabs/cargo-stylus
plus web search for release notes and breaking changes.

For anything behind, read the CHANGELOG and state: how many releases behind, whether the gap contains a BREAKING
change, and whether it fixes something that has actually affected this project.

FLAG PROMINENTLY if stylus-sdk or openzeppelin-stylus have shipped a version resolving the 0.3.0/0.9.0
host-target VM mismatch — that is a genuine win and changes the calculus.

Also verify the cargo-stylus version is consistent across ALL its call sites; a version that differs between
the Dockerfile, CI, and the readme is itself a finding.
${CONSTRAINTS}`,
  },
  {
    key: 'frontend-deps',
    prompt: `${PREAMBLE}

Audit the Next.js frontend stack in packages/nextjs.

Read package.json for the actual pinned versions. Then for each significant runtime dep — next, react, react-dom,
viem, wagmi, @rainbow-me/rainbowkit, typescript, and anything else core — find the latest release and the gap.

Prefer 'npm outdated' / 'yarn outdated' ONLY if it does not mutate the lockfile. If it would, read package.json
plus the lockfile and query the registry directly with 'npm view <pkg> version'.

For each meaningful gap report:
- how many major/minor versions behind
- whether the jump crosses a MAJOR with a documented migration guide
- whether staying behind costs anything TODAY (a broken feature, a missing fix) versus merely being older
- whether the dep has fallen out of its support window

Say plainly which ones are fine to leave alone. A list where everything is "should update" is a failed audit.
${CONSTRAINTS}`,
  },
  {
    key: 'security',
    prompt: `${PREAMBLE}

Security audit. Report only — fix nothing.

Run ALL of these and report the ACTUAL output:
1. gh api repos/{owner}/{repo}/dependabot/alerts --paginate
   (derive owner/repo from 'git remote get-url origin'. If it 403s or the feature is disabled, SAY SO —
   absence of alerts because the feature is off is NOT "no alerts". If this returns an empty list, you MUST also
   check 'gh api repos/{owner}/{repo}/dependency-graph/sbom' before treating that emptiness as clean — see TOOL
   TRAPS below.)
2. npm audit from packages/nextjs — use a form that does NOT modify the lockfile ('npm audit --json' against the
   existing lockfile). If the only available form would mutate files, skip and say why.
3. cargo audit for the Rust side. If cargo-audit is not installed, REPORT THAT — do not install it.
4. Known CVEs against the pinned versions of next, viem, wagmi, rainbowkit, stylus-sdk (web search).

For EACH advisory: package, severity, whether it is actually EXPLOITABLE given how this codebase uses it (a
devDependency advisory, or one in an unreachable code path, is not a live exposure), and the fixed version.

CRITICAL — every result must be classified as exactly one of these, and they must never be conflated:
  (a) scanner RAN successfully and found nothing
  (b) scanner did NOT run — not installed, disabled, permission denied
  (c) vulnerability found but NOT exploitable in this codebase
State which case applies for each tool you tried. A clean report from a scanner that never ran is worthless and
must be reported as severity "unchecked", not "up-to-date".
${TOOL_TRAPS}
${CONSTRAINTS}`,
  },
  {
    key: 'ui-se2-parity',
    prompt: `${PREAMBLE}

PART 1 — UI libraries. Read packages/nextjs/package.json for tailwindcss, daisyui, and other UI deps. Report
current vs latest, and specifically whether a MAJOR jump is pending (daisyui v4->v5, tailwind v3->v4) and what
that migration involves.

PART 2 — in-flight work already on the remote. Run 'git branch -r' and look for dependency/UI branches; at time
of writing 'origin/chore/deps-se2-parity' and 'origin/fix/daisyui-v5-dropdown' exist. For each such branch:
  git log origin/main..<branch> --oneline
  gh pr list --state all --head <branch>
Report what it contains, its age, whether it has a PR, and whether the content looks already-landed (squashed)
or genuinely pending. If a branch already does the work, SAY SO rather than proposing duplicate effort.

PART 3 — upstream scaffold-eth-2 parity. This project is a Stylus fork of scaffold-eth-2. Compare
packages/nextjs against https://github.com/scaffold-eth/scaffold-eth-2 using gh api or web — do NOT clone
anything into this repo. Identify notable frontend fixes upstream has that we lack, focusing on user-visible
things: debug UI bugs, hook fixes, component fixes. IGNORE purely cosmetic divergence and anything
Ethereum-specific that does not apply to Stylus (different chain, different contract model).

Be selective. A long list of upstream commits is not useful; three that matter is.
${CONSTRAINTS}`,
  },
]

phase('Scan')
log(`Phase 1 — scanning ${DIMENSIONS.length} dimensions on the main repo`)

const results = (await parallel(
  DIMENSIONS.map((d) => () =>
    agent(d.prompt, { label: `scan:${d.key}`, phase: 'Scan', schema: FINDINGS })
      .then((r) => (r ? { area: d.key, ...r } : null))
  )
)).filter(Boolean)

if (results.length < DIMENSIONS.length) {
  log(`WARNING: ${DIMENSIONS.length - results.length} dimension(s) returned nothing — coverage is incomplete`)
}

phase('Report')

const report = await agent(
  `Synthesize a dependency upgrade plan for the main scaffold repo from these scans:

${JSON.stringify(results, null, 2)}

Produce a decision-ready report:
1. One-sentence verdict: does anything NEED updating right now?
2. SECURITY FIRST. Any exploitable advisory leads regardless of other severity. If a scanner did not actually
   run, report that as an UNCHECKED dimension — loudly — instead of implying clean.
3. Everything else ranked: should-update > optional > blocked > up-to-date > unchecked.
4. Split by coupling. INDEPENDENT changes can ship alone. COUPLED changes force another change and need their
   own planned task with re-verification (contract sizes, OZ compat, an extension deploy). Never present a
   coupled change as a simple bump.
5. Explicitly list what was checked and found CURRENT, so cleared ground is distinguishable from skipped ground.
6. Note where an existing branch already covers a finding, so nobody duplicates that work.
7. END with an explicit disclosure, populated into the notRunOrUnchecked field: every scanner, tool, or check
   that did NOT execute this run — not installed, disabled, no access, or skipped because the only way to run it
   would mutate a file. This is a first-class section, not a footnote — a run where cargo-audit never executed
   or the GitHub dependency graph came back unpopulated must surface those gaps as loudly as any finding. Do not
   let an unexecuted check quietly vanish into a clean-looking summary.

Be blunt. Do not invent work. If the honest answer is "almost nothing needs updating", say exactly that.
This is phase 1 — do NOT comment on sibling repos.`,
  { label: 'synthesize', phase: 'Report', schema: SYNTHESIS_FINDINGS }
)

return {
  phase: 1,
  scope: 'main-repo-only',
  verdict: report,
  areas: results.map((r) => r.area),
  notRunOrUnchecked: report.notRunOrUnchecked,
}
