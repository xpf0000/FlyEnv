# MySQL Cluster instance fixes (0.1.3)

Four user-authorized corrections remain entirely inside the plugin: structured-clone-safe lifecycle/RPC parameters, modal form errors and required markers, state-dependent lifecycle buttons, and automatic initial ports from saved instances.

## Operation contract

Creation/start/restart/replication/removal remain owned by MysqlClusterController and the existing ModuleInstalledItem lifecycle; Fork still owns process identity, ports and daemon liveness. No new Pinia/shared configuration/host changes or exceptions. Storage stays plugin-owned. Snapshot outgoing RPC arguments and start extension credentials before Electron IPC; every member's result remains independent, required start failures still prevent replication, and completed preparation/initialization is never discarded or replayed merely for notification failure.

Form inputs/required markers/automatic-port opt-out belong to the mounted dialog. The controller owns operation error presentation; validation invokes its modal notice command. Modal close/failure is supplementary and must neither overwrite operation results nor replay work. Creation failures use a modal rather than a bottom-of-form error; preserve prepared records and the existing list recovery path.

Port suggestions reserve all existing SQL/GR ports, including stopped instances; choose a contiguous SQL block and, for GR, its +100 communication block, within 1..65535. Initialize after existing SQL ports and advance past conflicts. Recalculate when an automatic mode/count changes, preserving explicit user port choices. Fork remains responsible for checking actual OS availability at creation.

Instance and group buttons derive from Fork snapshots, not renderer busy flags as evidence of running. Stopped rows expose start; running rows expose stop/restart. Partial groups expose start/stop, complete running groups stop/restart.

## Verification

- Reproduce the reported clone error using the real plugin manager, controller, ModuleInstalledItem and forkTerminalRequest, with structuredClone enforced at the IPC.send boundary (not an accepting fake transport). Exercise source/replica and GR create, status, restart and removal.
- Regression tests for port allocation/count/GR conflicts/limits and modal error routing/deduplication/notification failure isolation.
- Compile and interact with the real dialog/list (required markers, popup errors, default ports and lifecycle buttons) using a controlled bridge; no actual user service mutation.
- Focused suite, lint, operation boundary audit, full types against existing baseline, build/archive/hash verification; src/scripts diff remains empty.
