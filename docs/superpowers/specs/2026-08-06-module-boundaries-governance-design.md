# Module Boundaries and Operation Ownership Design

**Goal:** Prevent new FlyEnv modules and features from scattering long-running operation state, IPC callbacks, notifications, and cleanup across Vue pages.

## Decision

Adopt three layers of enforcement:

1. `AGENTS.md` defines non-negotiable ownership and lifecycle rules.
2. `.codex/skills/flyenv-module-boundaries/` guides every relevant change through the same classification and verification workflow.
3. A lightweight architecture contract prevents new direct IPC usage in module entry pages while retaining an explicit legacy allowlist for existing pages.

This is deliberately incremental. The repository has direct IPC usage in 80 Vue components and 10 module `Index.vue` files. A global ban would turn this governance change into an unrelated rewrite. The contract blocks new regressions and makes each legacy migration visible.

## State Ownership

Every stateful feature must assign each state to one owner before implementation.

| State | Owner | Lifetime | Examples |
| --- | --- | --- | --- |
| View state | Mounted Vue component | Component mount only | Dialog visibility, form input, selected table row, tab-local filter |
| Domain state | Pinia store or established module store | Application session or persisted configuration | Selected version, installed service list, user settings |
| Renderer operation state | Module-local singleton controller | Until its terminal response, independent of page mount | Installing a companion, opening a web panel, download progress, asynchronous setup |
| Process state | Fork module/service runtime | Process lifetime | Child PID, bound port, health, companion shutdown ordering |

No state may move to a page merely because the first button that triggers it is rendered there. The owner follows the state lifetime, not the triggering element.

## Renderer Operation Controller

Any renderer operation that can outlive its initiating page, produces progress responses, launches or waits on an external process, opens a web panel, downloads or installs software, or requires terminal cleanup must have a controller in its owning module directory.

The controller is a default-exported singleton. It owns:

- Reactive operation state, such as `opening`.
- Preconditions and immutable request snapshots.
- IPC registration and every progress/terminal response.
- Operation-specific notices, errors, URL launch, and listener cleanup.
- Re-entry protection so repeated clicks cannot create duplicate requests.

Its page imports the singleton, binds state, and invokes its public command. It does not own an operation-level `ref`, invoke its IPC command, inspect operation responses, show operation notices/errors, or clear the IPC listener. A generic map that owns only booleans is not an operation controller and must not be used as a substitute.

The controller's state lasts for the Electron renderer process. It is not persisted across application restart unless the business requirement explicitly calls for persistence.

## Process Lifecycle Boundary

Fork modules own the actual external process lifecycle. They record or discover child PIDs, report service state, and stop companions before or with their parent service according to the module's shutdown contract. Renderer controllers never infer a running process from a loading flag, and a service stop must not depend on the page that launched its companion still being mounted.

## Required Operation Contract

Before implementation, the change plan must record the following for every long-running renderer operation:

| Field               | Requirement                                                         |
| ------------------- | ------------------------------------------------------------------- |
| Owner               | Exact controller or fork runtime class                              |
| Lifetime            | What event starts it and which response/process event ends it       |
| Intermediate events | Progress codes, notices, and states that must not finish the action |
| Terminal events     | Success, failure, cancellation, and listener cleanup behavior       |
| Re-entry            | Duplicate-click behavior and whether an existing process is reused  |
| Service interaction | Parent/companion stop ordering and PID ownership when applicable    |
| Tests               | The lifecycle assertions that prove each invariant                  |

## Enforcement

Add `test:renderer-operation-boundaries` as a fast source-level architecture test and run it before production build/CI packaging. The test will:

- Reject direct `@/util/IPC` imports from any new module `Index.vue`.
- Keep a documented allowlist for the existing direct-IPC entry pages; removing an entry is part of migrating that module.
- Verify controller-owned pages import their module controller and do not implement the operation lifecycle themselves.

The allowlist is a migration mechanism, not permission for new code. Other component types may issue short-lived, view-scoped queries directly when they do not meet the controller criteria; the project Skill determines that boundary during design.

## Project Skill

Create `.codex/skills/flyenv-module-boundaries/SKILL.md` with a focused trigger for additions or changes involving modules, IPC, service lifecycle, background operations, downloads, installations, web panels, or external processes.

The Skill will require the agent to:

1. Read the `AGENTS.md` ownership rules and classify each new state.
2. Decide whether a module controller is required before editing UI code.
3. Write the required operation contract into the implementation plan.
4. Keep UI bindings, renderer operation control, and fork process ownership separate.
5. Add tests for duplicate invocation, progress retention, terminal cleanup, and page re-entry where relevant.

The Skill will be concise and link to `AGENTS.md` for durable policy instead of duplicating the full guidance.

## Non-Goals

- Do not immediately migrate all 80 components that directly use IPC.
- Do not force simple synchronous interactions or ordinary local form state into classes.
- Do not reintroduce a global state map that separates an operation's loading flag from its behavior.
- Do not make renderer state a source of truth for process liveness.

## Acceptance Criteria

- `AGENTS.md` tells future contributors exactly where each category of state belongs.
- The project Skill is discoverable in `.codex/skills/` and guides relevant changes.
- The architecture test prevents new direct IPC imports in module entry pages without failing on known legacy pages.
- The test is executed by the production build or its CI equivalent.
- The three current web-panel controllers remain compliant under the new rule.
