# Fork Worker Idle Reclamation Design

## Goal

Reduce FlyEnv's long-term idle memory by terminating unused Electron utility-process workers while preserving running services, existing IPC command names, progress events, concurrency, and transparent worker restart.

## Current Behavior

`ForkManager` currently owns four worker categories:

- The first generic pool worker has `autoDestroy = false` and remains alive until FlyEnv exits.
- Additional generic pool workers terminate 10 seconds after their last task.
- The dedicated DNS and `ftp-srv` workers never terminate before FlyEnv exits.
- The dedicated Ollama chat worker terminates 10 seconds after its last request.

DNS and `ftp-srv` require dedicated workers because their active server objects live inside the utility process. Destroying those workers while their services are running would stop the user-facing service.

## Idle Policy

The worker roles and idle thresholds are:

| Worker role | Idle timeout | Retention rule |
| --- | --: | --- |
| Generic primary worker | 3 minutes | The first reusable generic pool worker keeps its primary role across child-process restarts. |
| Additional generic workers | 10 seconds | Reclaimed after all commands assigned to the worker finish. |
| Ollama chat worker | 10 seconds | Retained while chat or stop-output commands are still pending. |
| DNS worker | 10 seconds | Pinned while the DNS service is running; countdown begins only after a successful stop. |
| `ftp-srv` worker | 10 seconds | Pinned while the FTP service is running; countdown begins only after a successful stop. |

Dedicated workers do not participate in the generic pool's “only primary worker” three-minute rule. A sole DNS, FTP, or Ollama worker therefore still uses the 10-second policy when it is eligible for reclamation.

The generic primary role is based on the reusable `ForkItem` identity rather than the current number of live OS child processes. This avoids changing an already-scheduled timeout when another worker exits and keeps the behavior deterministic:

- the first generic `ForkItem` always receives the 3-minute timeout;
- every later generic `ForkItem` always receives the 10-second timeout;
- a destroyed primary child transparently respawns in the same primary `ForkItem` on the next generic command.

## Lifecycle Model

Each `ForkItem` owns a lifecycle controller with four inputs:

1. **Task started:** cancel any idle timer and increment the active-task count.
2. **Task settled:** decrement the active-task count. When the count reaches zero and the worker is not pinned, schedule its role-specific idle timeout.
3. **Pinned/unpinned:** pinning cancels the timer; unpinning schedules the idle timeout when no tasks remain.
4. **Child exited/destroyed:** cancel the timer, reset transient pin state, and mark the child unavailable.

An idle timeout kills only the Electron utility child. The `ForkItem` remains registered with `ForkManager`, so the next command can reuse its callbacks, role, bridges, and initialization provider while transparently spawning a new child.

Progress messages (`code === 200`) do not settle a task. Only terminal success or failure responses (`code === 0` or `code === 1`) make a task eligible for idle reclamation.

## Generic Pool Behavior

The existing pool selection and CPU-based concurrency limit remain unchanged. The behavioral change is limited to idle retention:

- the first generic worker changes from permanent retention to a 3-minute idle timeout;
- every additional generic worker keeps a 10-second idle timeout;
- a new command arriving during the countdown cancels the timer;
- multiple concurrent commands on one worker must all settle before any countdown begins;
- a command sent after child termination respawns the child and posts the latest `Server` and language snapshot before dispatching the command.

Long-running native services started by ordinary modules are not hosted by the utility worker after startup; existing additional generic workers already terminate after those start commands. Applying idle reclamation to the primary generic worker therefore preserves their established process behavior.

## Dedicated Service Workers

DNS and `ftp-srv` add service-aware pinning around their existing dedicated `ForkItem`:

- a successful `startService` response pins the worker;
- a failed `startService` response leaves it unpinned and eligible for the 10-second timeout;
- a successful `stopService` response unpins the worker and starts the 10-second timeout once no task remains;
- a failed `stopService` response leaves the worker pinned because the service may still be running;
- configuration and status commands do not change the pin state;
- an unexpected child exit clears the pin because the in-process DNS/FTP server is no longer running.

Repeated starts are idempotent at the lifecycle level: the pin is a boolean service state, not a reference count. A later successful stop releases it once.

Ollama chat does not need service pinning. Its request remains active until the fork sends a terminal response, and the existing task tracking naturally keeps the worker alive during streaming output. Once all chat and `stopOutput` commands settle, the 10-second countdown begins.

## Broadcast and Shutdown Behavior

Idle reclamation must not recreate workers for background broadcasts:

- language changes are sent only to live children;
- environment invalidation is sent only to live children;
- stopped workers receive the latest language and server snapshots through normal initialization when they next respawn.

Application shutdown remains immediate. `ForkManager.destroy()` cancels every idle timer, flushes the bin-version cache, unregisters the environment provider, and kills all live children without waiting for their idle thresholds.

## Error Handling

- A child error resolves outstanding renderer requests using the existing `{ code: 1, msg }` response path.
- Once no tracked tasks remain, an unpinned errored worker follows its normal role-specific idle policy.
- Unexpected exit cancels stale timers and clears DNS/FTP pin state.
- Sending a command while a child is loading must continue using the existing child rather than spawning a duplicate.
- Timer callbacks re-check both active-task count and pin state before killing the child, protecting against races with newly arrived commands.

## Testing Strategy

Introduce deterministic lifecycle tests with injected fake timers and a fake idle callback. Cover:

- primary generic timeout fires at 180 seconds and not at 10 seconds;
- additional generic, Ollama, stopped DNS, and stopped FTP workers fire at 10 seconds;
- a new task cancels a pending timeout;
- two concurrent tasks start the timeout only after both settle;
- pinning prevents termination beyond the timeout;
- successful stop unpins and starts the 10-second timeout;
- failed stop keeps the worker pinned;
- explicit destroy cancels timers;
- child exit clears the service pin;
- a command after idle termination transparently respawns one child and receives current initialization data;
- language and environment broadcasts skip exited children.

Run the focused lifecycle tests together with TypeScript, ESLint, main-process lazy bundle tests, language fork tests, environment-sync tests, stop-process-list tests, bin-version-cache tests, and a packaged utility-process smoke test.

## Out of Scope

- Changing the maximum generic worker count.
- Moving DNS or FTP server implementations out of the fork process.
- Terminating native services when their command worker is reclaimed.
- Changing renderer IPC names or response payloads.
- Adding user-configurable timeout settings.
