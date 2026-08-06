# Module Boundaries Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish project-wide state ownership and operation lifecycle rules that prevent future FlyEnv modules from scattering persistent work across Vue pages.

**Architecture:** `AGENTS.md` holds mandatory policy; a concise project Skill applies that policy while planning and implementing module work; one fast source contract blocks new direct IPC imports in module entry pages and verifies known controller-owned operations. Existing entry pages remain explicitly allowlisted until independently migrated.

**Tech Stack:** Markdown, Codex project Skills, TypeScript/tsx source contracts, Yarn build scripts.

---

### Task 1: Lock the Boundary Contract Before Policy Exists

**Files:**

- Create: `scripts/renderer-operation-boundaries-test.ts`

- [x] **Step 1: Write the failing source contract.** Create a TypeScript script that recursively enumerates `src/render/components/**/Index.vue`, finds direct `@/util/IPC` imports, and begins with these assertions:

```ts
const legacyDirectIpcIndexPages = [
  'Aside/Index.vue',
  'Host/Index.vue',
  'Temporal/Index.vue',
  'Tools/BomClean/Index.vue',
  'Tools/PhpObfuscator/Index.vue',
  'Tools/PortKill/Index.vue',
  'Tools/ProcessKill/Index.vue',
  'Tools/SSLMake/Index.vue',
  'Tools/SiteSucker/Index.vue',
  'Tools/SystenEnv/Index.vue'
]

assert.deepEqual(actualDirectIpcIndexPages, legacyDirectIpcIndexPages)
assert.match(agentsSource, /## Module Boundaries and Operation Ownership/)
assert.equal(existsSync(skillPath), true)
assert.match(skillSource, /^---\nname: flyenv-module-boundaries/m)
assert.equal(
  packageJson.scripts?.['test:renderer-operation-boundaries'],
  'tsx scripts/renderer-operation-boundaries-test.ts'
)
assert.match(packageJson.scripts?.build ?? '', /^yarn test:renderer-operation-boundaries && /)
```

Also define registrations for `PostgreSql/PgAdminPanel.ts`, `MongoDB/DbGatePanel.ts`, and `ClickHouse/ChUiPanel.ts`. For each registration, assert the page imports its singleton, does not import IPC, the controller exports a class, owns `readonly opening = ref(false)`, and uses `export default new`.

- [x] **Step 2: Run the contract and verify RED.**

Run: `yarn tsx scripts/renderer-operation-boundaries-test.ts`

Expected: FAIL because the ownership section, project Skill, and package scripts do not exist.

### Task 2: Add the Durable Policy and Build Gate

**Files:**

- Modify: `AGENTS.md`
- Modify: `package.json`
- Test: `scripts/renderer-operation-boundaries-test.ts`

- [x] **Step 1: Add `## Module Boundaries and Operation Ownership` to `AGENTS.md`.** State the following mandatory rules in concise form:

```markdown
- UI state belongs to the mounted Vue component only.
- Domain state belongs to Pinia or the established module store.
- Long-running renderer operations belong to a module-local singleton controller.
- Fork modules own child processes, PID/port state, and companion shutdown.
- Entry pages bind controller state and commands; they do not own operation IPC, progress, notices, terminal errors, or cleanup.
- A change plan must record owner, lifetime, intermediate and terminal events, duplicate invocation behavior, service interaction, and lifecycle tests.
```

Require reading `.codex/skills/flyenv-module-boundaries/SKILL.md` before changing modules, IPC, service lifecycle, background operations, downloads, installs, web panels, or external processes. State that a generic loading-state map cannot replace a controller.

- [x] **Step 2: Register the source contract.** Add this package script:

```json
"test:renderer-operation-boundaries": "tsx scripts/renderer-operation-boundaries-test.ts"
```

Prefix the production `build` script with `yarn test:renderer-operation-boundaries && `. Do not edit the three packaging workflows; all already invoke `yarn build`.

- [x] **Step 3: Re-run the contract and verify it still fails only because the Skill has not been created.**

Run: `yarn tsx scripts/renderer-operation-boundaries-test.ts`

Expected: FAIL at the missing `.codex/skills/flyenv-module-boundaries/SKILL.md` assertion.

### Task 3: Create and Forward-Test the Project Skill

**Files:**

- Create: `.codex/skills/flyenv-module-boundaries/SKILL.md`
- Create: `.codex/skills/flyenv-module-boundaries/agents/openai.yaml`
- Test: `scripts/renderer-operation-boundaries-test.ts`

- [x] **Step 1: Establish the Skill RED case.** Use the still-failing contract from Task 2 as the missing-Skill proof. Before creating the Skill, run one pressure scenario without it: ask an isolated reviewer to plan a fictitious service panel that installs a companion after the initiating page is left. Record whether it assigns loading/IPC callbacks to the page; do not supply the intended architecture.

- [x] **Step 2: Initialize the Skill folder.**

Run:

```bash
python3 /Users/x/.codex/skills/.system/skill-creator/scripts/init_skill.py flyenv-module-boundaries --path .codex/skills --interface 'display_name=FlyEnv Module Boundaries' --interface 'short_description=Keep module UI, operations, and processes separate' --interface 'default_prompt=Apply FlyEnv module boundary rules to this change.'
```

- [x] **Step 3: Replace the generated Skill body with a concise, imperative workflow.** Its frontmatter description must trigger for FlyEnv changes involving new or changed modules, renderer IPC, service lifecycle, background operations, downloads, installations, web panels, or external processes. The body must require:

```markdown
1. Read the mandatory ownership policy in `AGENTS.md`.
2. Classify every new state as view, domain, renderer operation, or fork process state.
3. Create a module-local singleton controller when the operation outlives its page, reports progress, starts/waits for an external process, downloads/installs, opens a panel, or needs terminal cleanup.
4. Keep page bindings, controller lifecycle handling, and fork process lifecycle separate.
5. Put owner, lifetime, intermediate events, terminal events, re-entry behavior, service interaction, and tests in the implementation plan.
6. Test duplicate invocation, progress retention, terminal cleanup, and page re-entry whenever applicable.
```

Explicitly reject local page `ref`s for long-running operations and generic maps that retain only loading state. Link to `AGENTS.md`; keep the body under 500 words and do not add unrelated resources.

- [x] **Step 4: Verify GREEN and validate behavior.**

Run: `yarn tsx scripts/renderer-operation-boundaries-test.ts`

Expected: PASS.

Run the same isolated reviewer scenario after directing it to read the new Skill. It must identify a module-local controller, page-independent operation state, and fork-owned companion shutdown. If it finds a loophole, update the Skill and repeat the scenario.

### Task 4: Verify the Repository Gate and Documentation

**Files:** Verify all files from Tasks 1-3 plus `docs/superpowers/specs/2026-08-06-module-boundaries-governance-design.md` and this plan.

- [x] **Step 1: Run focused verification.**

```bash
yarn test:renderer-operation-boundaries
yarn test:postgresql-pgadmin4
yarn test:mongodb-dbgate
yarn test:clickhouse-ch-ui
node node_modules/typescript/bin/tsc --noEmit --pretty false
```

- [x] **Step 2: Prove production builds execute the gate without packaging.** Inspect `package.json` to confirm `build` begins with `yarn test:renderer-operation-boundaries &&`; run the gate directly rather than producing platform packages.

- [x] **Step 3: Run formatting and diff checks.** Do not format all of `AGENTS.md`: it has pre-existing formatting that is outside this scope. Rely on `git diff --check` for its added policy section.

```bash
yarn eslint scripts/renderer-operation-boundaries-test.ts
node node_modules/prettier/bin/prettier.cjs --check package.json scripts/renderer-operation-boundaries-test.ts .codex/skills/flyenv-module-boundaries/SKILL.md .codex/skills/flyenv-module-boundaries/agents/openai.yaml docs/superpowers/specs/2026-08-06-module-boundaries-governance-design.md docs/superpowers/plans/2026-08-06-module-boundaries-governance.md
git diff --check
```

- [x] **Step 4: Commit the implementation.** Stage only the policy, Skill, contract, package script, and design/plan documents. Commit with `feat: enforce module operation boundaries`.
