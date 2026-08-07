---
name: flyenv-module-boundaries
description: Use when adding or changing a FlyEnv module, renderer IPC flow, service lifecycle, background operation, download, installation, web panel, or external process.
---

# FlyEnv Module Boundaries

Treat state ownership as an architecture decision. Assign an owner by lifetime, never by the button or page that first triggers the work.

## Default Module Constraints

These are prohibitions unless the user explicitly authorizes an exception for the specific new module:

- **Shared configuration**: Never persist module-owned state in `config.setup`. Use `StorageSetAsync`/`StorageGetAsync` for module-owned persistence.
- **Pinia**: Do not create a new Pinia store for module-owned state. Use a normal module-local class or singleton and bind it with `reactiveBind`.
- **Lifecycle duplication**: Reuse `ModuleInstalledItem.start()`, `stop()`, and `restart()` whenever the public lifecycle supports the module. Supply module-specific values through `startExtParam`/`stopExtParam`, registered in the module (normally `components/<Module>/aside.vue`). Add a module-specific start/stop workflow only after proving the shared methods cannot express the required behavior.
- **Public leakage**: Keep module-only properties, types, policies, helpers, and methods in the module directory. Do not add them to shared service types, `ModuleInstalledItem`, `BrewStore`, or generic lifecycle helpers.

Record any explicit exception and its scope in the implementation plan. Existing code is not authorization for copying an older pattern.

## Required Workflow

1. Read `AGENTS.md`, including **Module Boundaries and Operation Ownership**, before editing.
2. Classify every new state as view, domain, renderer operation, or fork process state.
3. Add an operation contract to the plan for every long-running renderer operation.
4. Check the **Default Module Constraints** above and document any explicit exception.
5. Implement only after the owner, terminal events, and tests are explicit.

## State Owners

| State                                           | Owner                                |
| ----------------------------------------------- | ------------------------------------ |
| Inputs, dialogs, selections, visual filters     | Mounted Vue component                |
| Existing shared selected versions, installed lists, settings | Pinia or an established module store |
| One asynchronous operation and its UI lifecycle | Module-local singleton controller    |
| Child process, PID, port, health, stop ordering | Fork module/runtime                  |

Use a module-local singleton controller when work can outlive its page, emits progress, starts or waits for an external process, downloads or installs, opens a panel, or needs terminal cleanup. The controller owns preconditions, immutable request data, IPC registration, progress, notice, success/failure, re-entry guard, and listener cleanup. The page imports the singleton, binds its state, and calls its command.

Do not put a long-running operation's `ref`, IPC callback, notice, error, or cleanup in a page. Do not put transient operation lifecycle state in Pinia merely because a page can unmount. Do not use a generic loading-state map: it retains a flag while separating it from the operation it must control.

Keep fork ownership separate. The fork module starts and stops real processes, records/discovers PIDs and ports, and stops companions with their parent. Renderer loading state is never proof that a process is running.

## Operation Contract

Record the owner, start event, intermediate events, terminal events, duplicate invocation behavior, parent/companion interaction, and lifecycle tests. Treat `code: 200` or another declared progress event as non-terminal; clear renderer operation state only at a declared terminal event.

## Verification

Add focused tests for duplicate invocation, progress retention, terminal cleanup, and page re-entry whenever applicable. Also test failure/retry and parent/companion shutdown when the operation starts a process. Update `test:renderer-operation-boundaries` when a module entry page or a controller-owned operation changes.
