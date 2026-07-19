# Capturer Shortcut Cold-Start Design

## Problem

When FlyEnv starts with a persisted screenshot shortcut, pressing that shortcut does nothing until the user manually starts a screenshot from the Tools page. After the first manual screenshot, the shortcut works for the rest of the process lifetime.

The regression was introduced when the main-process screenshot implementation became lazy. Renderer startup still restores `flyenv-capturer-setup` from LocalForage and sends `Capturer:Config-Update`. The main-process handler now stores that configuration and only applies it through `capturerRuntime.peek()`. On a cold start, `peek()` returns no runtime, so `Capturer.configUpdate()` never calls `globalShortcut.register()`. A manual screenshot later calls `loadCapturer()`, which applies the stored configuration and registers the shortcut, producing the reported behavior.

## Requirements

- A persisted, permitted screenshot shortcut must work after normal application startup without first opening or operating the screenshot tool.
- A user with no screenshot shortcut must not load the native screenshot runtime during startup.
- Updating a shortcut while the screenshot runtime is loaded must replace the previous registration.
- Clearing a shortcut while the screenshot runtime is loaded must unregister the previous shortcut.
- Screenshot runtime import failures must use the existing IPC error response and remain retryable.
- Existing renderer storage, IPC command names, screenshot behavior, and trial/license checks remain unchanged.
- The main-process startup bundle must keep the screenshot implementation and `@xpf0000/node-window-manager` outside its eager static graph.

## Selected Approach

Treat a non-empty persisted shortcut as configuration that explicitly requires the screenshot runtime at startup. `Capturer:Config-Update` continues to cache the latest configuration, but it conditionally loads the runtime when no instance exists and `config.key` is non-empty. The runtime then receives the cached configuration and registers the shortcut before the IPC request reports success.

If the runtime is already loaded, the handler applies every configuration update immediately, including an empty shortcut that unregisters the old accelerator. If the runtime is not loaded and the shortcut is empty, the handler only caches the configuration and returns success without importing the screenshot implementation.

This is the smallest change that restores the established behavior. It also follows the existing lazy-loading design rule that optional modules may load at startup when persisted configuration explicitly requires them.

## Alternatives

### Separate Lightweight Shortcut Service

A small eager service could own `globalShortcut` registration and dynamically load the screenshot implementation only after the shortcut is pressed. This would retain more idle-memory savings for users with a configured shortcut, but it would split screenshot lifecycle ownership and introduce additional first-keypress loading, error-reporting, and shutdown coordination. That complexity is unnecessary for this regression.

### Restore Fully Eager Screenshot Loading

The main process could import the screenshot implementation during every launch. This would restore the shortcut but would also load the native window-manager dependency for users who never configure or use screenshots, undoing the intentional lazy boundary.

## Main-Process Data Flow

### Cold Start With a Saved Shortcut

```text
renderer startup
  -> CapturerSetup restores LocalForage configuration
  -> Capturer:Config-Update
  -> IPCHandler caches the configuration
  -> no loaded Capturer and config.key is non-empty
  -> capturerRuntime.load()
  -> Capturer.configUpdate(configuration)
  -> globalShortcut.register(accelerator)
  -> IPC success response
```

### Cold Start Without a Saved Shortcut

```text
renderer startup
  -> no saved screenshot configuration, or config.key is empty
  -> Capturer remains unloaded
  -> no native screenshot dependency is initialized
```

### Configuration Change After First Use

```text
Capturer:Config-Update
  -> IPCHandler caches the new configuration
  -> capturerRuntime.peek() returns the loaded instance
  -> Capturer.configUpdate(configuration)
  -> unregister old accelerator if present
  -> register new accelerator when non-empty
  -> IPC success response
```

## Error Handling and Concurrency

- The configuration IPC response waits for a required first load and registration to complete.
- A dynamic-import failure returns through the existing command-specific `{ code: 1, msg }` path.
- `LazyRuntime` already clears a rejected promise, so a later configuration update or manual screenshot can retry.
- Concurrent configuration and manual screenshot requests share the same cached load promise.
- The latest cached configuration remains the source applied by `loadCapturer()` after the runtime resolves.
- An empty shortcut never triggers a first load; if a runtime already exists, the empty configuration is still applied so the old accelerator is removed.

## Testing Strategy

Implementation follows red-green-refactor:

1. Add a focused behavior test around the lazy screenshot configuration policy.
2. Verify the test fails because a non-empty cold-start shortcut does not load and configure the runtime.
3. Implement the conditional load with the minimum production change.
4. Verify these cases:
   - a non-empty shortcut loads an unloaded runtime and applies the configuration;
   - an empty shortcut leaves an unloaded runtime untouched;
   - an already loaded runtime receives an empty configuration so it can unregister the shortcut;
   - a load failure reaches the existing IPC error path and can be retried.
5. Update the main-process lazy-bundle audit so it permits the configuration-triggered dynamic load while still rejecting an eager static screenshot import.
6. Run the focused regression test, the complete main-process lazy test group, lint for changed TypeScript files, and the relevant build/static-graph audit.

## Acceptance Criteria

- After restarting FlyEnv with a saved screenshot shortcut, the first shortcut press opens screenshot capture without any prior Tools-page action.
- After restarting FlyEnv without a screenshot shortcut, `capturerRuntime.peek()` remains empty until a screenshot command is used.
- Saving a replacement shortcut disables the old accelerator and enables the new one.
- Clearing the shortcut disables the prior accelerator.
- All main-process lazy-loading tests pass and the screenshot implementation remains dynamically imported rather than statically reachable from the main entry.

## Non-Goals

- Moving screenshot configuration out of renderer LocalForage.
- Redesigning screenshot licensing or the trial period.
- Splitting global shortcut ownership into a new service.
- Refactoring unrelated optional main-process runtimes.
