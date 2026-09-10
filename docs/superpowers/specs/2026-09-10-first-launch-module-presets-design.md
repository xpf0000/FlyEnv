# First-launch module presets design

## Goal

Reduce the initial complexity of FlyEnv for new users by asking which technology stacks they use and showing only the relevant modules. A user may select multiple stacks; the resulting module visibility is the union of every selected preset. Existing users must never see the onboarding after upgrading, and their current visibility settings must remain unchanged.

The onboarding changes visibility only. It does not install, start, stop, remove, or configure software.

## Scope

The feature adds one first-launch modal, a catalog of built-in stack presets, a reliable fresh-install marker, and a bootstrap gate that delays module discovery until the modal is resolved. It reuses the existing `config.setup.common.showItem` visibility map and the existing Settings → Modules screen.

The first version does not detect locally installed runtimes, recommend stacks dynamically, remember selected preset names, or provide a way to re-run the preset picker. After onboarding, Settings → Modules remains the only editor for module visibility.

## User experience

After the renderer has loaded its configuration, language, and theme, a fresh installation displays a modal over the normal application shell. The modal cannot be dismissed by its backdrop, close icon, or Escape key; the user must choose one of its three outcomes.

The modal contains:

- A title explaining that the user can choose the technology stacks they commonly use.
- A short note that module visibility can be changed later under Settings → Modules.
- Multi-select technology-stack cards with an icon, name, and concise module summary.
- A live count of the distinct modules that will be visible.
- A primary **Apply and start** action.
- A secondary **Customize modules** action.
- A visually quiet **Show all modules** action.

PHP is selected initially. Stack cards are additive: selecting PHP and Python produces one deduplicated union. Deselecting every stack is allowed and leaves only the common foundation modules visible.

### Outcomes

**Apply and start** builds a complete visibility map for all built-in modules available on the current platform, persists that map and the completed onboarding version in one save, closes the modal, and starts normal module initialization.

**Customize modules** does not apply a preset. It persists only the completed onboarding version, starts normal initialization with the current default visibility, and navigates directly to `/setup` with `SetupStore.tab = 'module'`.

**Show all modules** explicitly marks every built-in module available on the current platform as visible, persists that map and the completed onboarding version in one save, closes the modal, and starts normal module initialization.

If saving fails, the modal remains open, the action becomes available again, and the user receives an error message. A dedicated acknowledged onboarding IPC persists the completion marker and visibility map in one main-process configuration patch; they must never be saved in separate requests, because that could leave the installation marked complete with only part of the selected visibility applied.

## Preset catalog

Every applied preset also includes these foundation modules:

- `startup-group`
- `hosts`
- `tools`

The initial presets are:

| Preset | Module flags |
| --- | --- |
| PHP | `php`, `php-fpm`, `apache`, `nginx`, `node`, `mysql`, `mariadb`, `redis` |
| Node.js | `node`, `nginx`, `mysql`, `postgresql`, `mongodb`, `redis` |
| Java | `java`, `gradle`, `tomcat`, `nginx`, `mysql`, `postgresql`, `redis` |
| Python | `python`, `nginx`, `mysql`, `postgresql`, `redis` |
| Go | `golang`, `nginx`, `mysql`, `postgresql`, `redis` |
| .NET | `dotnet`, `nginx`, `mysql`, `postgresql`, `redis` |
| Ruby | `ruby`, `node`, `nginx`, `mysql`, `postgresql`, `redis` |
| Rust | `rust`, `nginx`, `mysql`, `postgresql`, `redis` |

Preset definitions live beside the onboarding component and use `AllAppModule` values. They are not added to the public `AppModuleItem` type, module implementations, or shared lifecycle classes. Before computing the visibility map, the preset union is intersected with the current platform's `AppModules`; unsupported modules are silently omitted.

Applying a preset writes an explicit boolean for every current-platform built-in module: selected and foundation modules receive `true`, and all others receive `false`. Entries for modules unavailable on the current platform and entries belonging to custom modules are left untouched.

Modules added in a later FlyEnv release retain the application's existing missing-key behavior and therefore appear by default. This feature is intentionally a first-install simplification, not a permanent allowlist that hides future capabilities from users.

## Fresh-install detection and migration

The persistent root configuration gains `moduleOnboardingVersion`, with version `1` representing completion of this onboarding design. A dedicated name is used instead of the existing unused `showTour` value so that unrelated tours cannot accidentally suppress or trigger module selection.

Fresh-install status must be determined in the main process before `electron-store` creates or merges the new defaults:

- If no persisted `user.json` exists, initialize `moduleOnboardingVersion` to `0`. The renderer shows the modal.
- If a persisted `user.json` already exists but has no onboarding marker, migrate it to version `1`. This is an existing installation and must not see the modal.
- If the marker is already present, preserve it.

The main process remains the authority for this classification; renderer `localStorage`, installation timestamps, visible-module counts, and default-value comparisons are not reliable evidence of a fresh installation. Clearing individual settings does not recreate the onboarding. Removing the application's persisted user configuration makes the next launch a fresh installation again.

## Architecture and data flow

The existing `AppStore` remains the owner of shared application configuration. No new Pinia store is introduced.

The onboarding component owns only mounted-view state: whether the modal is visible, selected preset IDs, the active save action, and a displayed error. A small pure helper beside the component owns preset union, platform filtering, distinct counting, and complete visibility-map construction. Keeping this calculation independent of Vue and IPC makes it directly testable.

The renderer bootstrap sequence becomes:

1. The main process loads configuration and classifies the installation before applying new defaults.
2. The renderer initializes `AppStore`, language, and theme, then mounts the Vue application.
3. `App.vue` checks `moduleOnboardingVersion`.
4. Completed installations continue through the existing `init()` path immediately.
5. Fresh installations render the onboarding modal and do not call `initializeModules()` or fetch installed versions yet.
6. An onboarding action sends one immutable payload to the main process; the main process persists the version and optional visibility map together and returns an explicit success or failure response.
7. On success, the renderer applies the same payload to `AppStore` and invokes the existing initialization path exactly once. On failure, renderer state remains unchanged and the modal stays open.

The bootstrap gate belongs in `App.vue`, where the existing one-time `startupInitialized` and `modulesInitialized` guards already live. The onboarding component emits a terminal result to that owner; it does not initialize services itself.

The Settings → Modules navigation reuses the existing router and `SetupStore.tab`. It does not introduce a new route.

## State ownership and module-boundary review

| State | Owner and lifetime |
| --- | --- |
| Selected preset cards, modal visibility, saving indicator, displayed error | Mounted onboarding component |
| Module visibility and onboarding completion version | Existing application configuration exposed through `AppStore` |
| Module instances and installed-version discovery | Existing `BrewStore` and module lifecycle |
| Service processes, PID/port state, and shutdown | Existing fork modules; unchanged |

There is no new long-running renderer operation. The only asynchronous action is one short, acknowledged onboarding preference-save IPC request, so a module-local singleton controller and a progress-event contract are not warranted. The main process owns persistence and returns one terminal success or failure response; the component rejects duplicate clicks while the request is in flight. Success updates `AppStore` and releases bootstrap, while failure leaves renderer state unchanged, keeps the modal open, and restores retry availability.

No new module is added, no module-owned state is persisted in `config.setup`, no new Pinia store is created, no service start/stop path changes, and no module-only properties leak into shared service types. Therefore none of the New Module Constraints requires an exception.

## Expected implementation areas

- `src/main/core/ConfigManager.ts`: classify fresh versus existing persisted configuration and migrate the version marker.
- `src/main/core/AppNodeFn.ts` and `src/render/util/NodeFn.ts`: persist the onboarding payload through one acknowledged, typed IPC call.
- `src/render/store/app.ts`: type, load, and save the onboarding version with the existing application configuration.
- `src/render/App.vue`: gate the existing module initialization and host synchronization until onboarding resolves.
- `src/render/components/ModuleOnboarding/`: modal component and pure preset/visibility helpers.
- `src/lang/*`: localized onboarding copy for every supported language.
- `scripts/`: focused regression coverage for classification, preset union, platform filtering, atomic completion, and bootstrap gating.

Exact file boundaries may be tightened in the implementation plan, but the ownership described above must not change without revising this design.

## Verification

Automated checks must cover:

- A missing persisted user configuration receives version `0` and requires onboarding.
- A legacy persisted user configuration with no marker migrates to version `1` and retains its `showItem` values.
- A completed installation never opens the modal.
- PHP is the initial selection.
- Selecting PHP and Python produces the deduplicated union plus all foundation modules.
- Selecting no stacks produces exactly the supported foundation modules.
- Unsupported platform modules are excluded and their existing map entries are untouched.
- Apply writes explicit `true` and `false` values for every supported built-in module.
- Customize writes no visibility changes and navigates to Settings → Modules.
- Show all writes `true` for every supported built-in module.
- A save failure does not mark onboarding complete, release bootstrap, or close the modal.
- Duplicate clicks cause only one onboarding persistence request.
- Module initialization does not begin while onboarding is unresolved and begins exactly once after success.
- Existing module-visibility behavior and Settings → Modules controls continue to work.

Manual checks should cover light and dark themes, all three desktop platforms, keyboard focus order, narrow supported window sizes, long translated labels, the live distinct-module count, and all three terminal actions.

## Success criteria

- Only genuinely fresh installations see the modal, once.
- Existing users upgrade without any prompt or visibility change.
- Multi-selected stacks produce a deterministic union with no duplicate modules.
- The first visible sidebar is already filtered; users never watch the full catalog initialize before their choice is applied.
- Users can immediately bypass presets and reach Settings → Modules.
- No onboarding action installs, starts, stops, or modifies a service.
