# Startup Group Native Start/Stop Ordering Design

## Goal

Startup groups only orchestrate member order. Each version or project service remains responsible for its own start and stop behavior, completion, and error result.

## Execution Order

- Start members sequentially in the order stored in `group.items`.
- Stop members sequentially in the reverse order of `group.items`.
- Do not run start or stop operations in parallel.

## Result Handling

- Starting an already-running member is skipped.
- Stopping an already-stopped member is skipped.
- If a start fails, later members are marked `not-run` and are not started.
- If a stop fails, record that member as failed and continue stopping the remaining members in reverse order.
- Invalid members are reported as invalid and do not prevent other stop operations from being attempted.

## Native Module and Service Calls

- Service-version members call the resolved installed version's existing `start(...)` or `stop()` method.
- Start keeps the existing options that avoid changing the current version and avoid stopping other selected versions.
- Stop does not use the startup-group-specific `exactTarget` process polling path.
- Language-project members continue calling their existing `start(false)` and `stop(false)` methods.

## Timeout and State Rules

- Startup-group orchestration adds no timeout, retry, process polling, forced kill, or delayed state verification.
- It awaits the promise returned by each module or project service.
- A returned string or `false` is treated as failure; a successful result is treated as completion.
- If a module or service promise never settles, the startup-group operation also remains pending. This is intentional because the module or service owns execution completion.

## UI Behavior

- While the sequential operation is pending, startup-group controls remain disabled through the existing global runner state.
- Result messages preserve module names and member titles.

## Regression Coverage

- Verify start order is forward and sequential.
- Verify stop order is reverse and sequential.
- Verify a stop failure does not prevent earlier members from being stopped.
- Verify service-version stop is called without `exactTarget` options.
- Verify the runner does not perform a second state check after a successful native stop result.
