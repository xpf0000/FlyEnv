# Startup Group Class Architecture Design

## Goal

Reorganize the startup-group feature around maintainable classes, following the module-local structure used by Podman. Remove scattered startup-group implementation files from `src/render/core` and eliminate the component-level `store.ts`, `runtime.ts`, and `setup.ts` wrappers.

This is an internal architecture refactor. It must preserve the existing UI, storage format, license behavior, candidate-selection rules, start and stop ordering, live-state behavior, and error outcomes.

## Directory Structure

The startup-group implementation will live with its Vue components:

```text
src/render/components/StartupGroup/
├── class/
│   ├── StartupGroup.ts
│   ├── StartupGroupCandidate.ts
│   ├── StartupGroupManager.ts
│   ├── StartupGroupRunner.ts
│   ├── StartupGroupRuntime.ts
│   └── StartupGroupStore.ts
├── type.ts
├── Module.ts
└── *.vue
```

`type.ts` contains only persisted DTO shapes, dependency interfaces, result types, and discriminated unions. Stateful behavior and domain operations belong to classes.

The following implementation files will be removed after their behavior is moved:

- `src/render/core/StartupGroup.ts`
- `src/render/core/StartupGroupManager.ts`
- `src/render/core/StartupGroupRuntime.ts`
- `src/render/components/StartupGroup/store.ts`
- `src/render/components/StartupGroup/runtime.ts`
- `src/render/components/StartupGroup/setup.ts`

## StartupGroup Entity

Each saved group is hydrated as a `StartupGroup` class instance and wrapped with `reactiveBind`. The class owns behavior intrinsic to one group:

- Group identity, metadata, timestamps, and member collection.
- Updating metadata and replacing or reordering members.
- Determining whether the group is empty or eligible to be the default group.
- Returning member keys and the group-local reverse stop order.
- Starting, stopping, or toggling itself through an injected runner interface.
- Producing the unchanged plain JSON storage shape through `toJSON()`.

The constructor accepts the persisted DTO and a runner dependency. The entity must not import the global manager singleton. This keeps entity tests isolated and avoids circular dependencies.

Startup-group members remain plain discriminated-union DTOs. They are lightweight references to installed service versions or language projects, and turning them into an inheritance hierarchy would add serialization and type-narrowing overhead without enough behavior to justify it.

## Supporting Classes

### StartupGroupStore

Owns the reactive `StartupGroup[]`, the default group id, asynchronous initialization, and persistence through `StorageGetAsync` and `StorageSetAsync`.

It hydrates stored DTOs into `reactiveBind(new StartupGroup(...))` instances and serializes them with `toJSON()`. It owns collection-level operations such as create, delete, find, and selecting the default group. It does not execute services or projects directly.

### StartupGroupRunner

Owns execution state, active member keys, revision changes, sequential start behavior, reverse stop behavior, error conversion, and run results. Its public state uses normal class fields so `reactiveBind` exposes reactive booleans and numbers without nested Vue refs.

The hide-module stopping workflow and deduplicated stop queue belong here because they are execution lifecycle operations.

### StartupGroupRuntime

Owns service-version and language-project adapters, installed target lookup, project lookup, platform module discovery, filesystem validation, candidate loading, and project-source caching. It owns a `StartupGroupRunner` instance configured with its adapters.

### StartupGroupCandidate

Owns editor candidate behavior: identity matching, multiple-selection rules, selection normalization, item synchronization, and duplicate-module or duplicate-port warnings. It is stateless but remains a class for a consistent, discoverable API.

### StartupGroupManager

Acts as the single Vue-facing module entry. It composes the Store, Runtime, Runner, and Candidate instances and owns UI-oriented member resolution:

- Current member state and display information.
- Group and member running or executing checks.
- Loading required installed-version and project sources.
- Guarding group and member execution while busy.

Consumers import only the exported `StartupGroupManager` singleton. Responsibilities remain visible through named child objects:

```ts
StartupGroupManager.store.groups
StartupGroupManager.store.add(draft)
StartupGroupManager.runtime.listCandidates()
StartupGroupManager.candidate.toggleSelection(...)
StartupGroupManager.runner.run(group, action)
StartupGroupManager.getMemberDisplayTitle(item)
```

## Singleton Construction and Reactivity

Classes that expose state or are used by Vue are instantiated once and wrapped with `reactiveBind`. Construction uses dependency injection so lower-level classes never import the exported singleton.

The assembly order is:

1. Construct and bind the Runtime, including its bound Runner.
2. Construct and bind the Store with the Runner used for group hydration.
3. Construct and bind the Candidate service.
4. Construct and bind the Manager with those instances.
5. Export only the Manager singleton as the primary application entry.

Class constructors remain exportable for direct unit testing, but application code uses the singleton.

## Data and Execution Flow

At renderer startup, `StartupGroupManager.store.init()` reads persisted data, normalizes it, and hydrates group instances before Vue mounts.

Editor mutations call entity methods or collection methods on the Store. The Store serializes DTOs and persists them. Starting a group calls the entity, which delegates to the injected Runner. The Runner resolves actual service or project operations through Runtime adapters.

The default group id remains collection-level state because it describes the relationship between groups rather than one group's intrinsic data.

## Error Handling

Missing or unreadable storage still produces an empty collection. Storage write failures reject the calling operation. Runner failures keep the existing member outcome and error-message behavior. Runtime lookup or filesystem failures continue to result in invalid candidates or invalid member state as appropriate.

No error is swallowed merely because functionality moved into a class.

## Testing

The startup-group test suite will be migrated from factory-function tests to class-instance tests. Tests will cover:

- `StartupGroup` hydration, mutation, execution delegation, and `toJSON()` output.
- Store hydration into reactive class instances and unchanged persistence DTOs.
- Runner state, ordering, failures, and hide-module stopping.
- Candidate selection and warning rules through class methods.
- Runtime adapter and candidate loading behavior.
- Manager member resolution and busy-state behavior.
- Source-contract checks that old global core files and wrapper entry files are removed.
- Vue consumers importing the single `StartupGroupManager` entry.

Focused ESLint, `vue-tsc --noEmit`, and `yarn test:startup-groups` will verify the completed refactor.
