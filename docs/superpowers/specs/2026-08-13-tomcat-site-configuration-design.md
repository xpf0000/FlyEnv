# Tomcat Site Configuration Design

## Goal

Let a FlyEnv Tomcat site define and maintain multiple application Context mappings and optional
host-level rewrite rules, repair Tomcat SSL certificate/configuration ownership, and apply a saved
site configuration immediately by restarting an already running Tomcat service.

The design must support ordinary exploded web applications, external WAR files, and application
paths other than `/`. OpenMRS is a validation example, not a special case or a source of
application-specific behavior.

## Scope

- A Tomcat site may have zero or more managed Context mappings. Each mapping has a context path and
  an absolute `docBase` path to an existing directory or WAR file.
- A Tomcat site may enable host-level rewrite and edit its `rewrite.config` content.
- Saving a Tomcat site generates its managed Context descriptors, manages the host RewriteValve,
  refreshes SSL state/configuration, and restarts Tomcat if it was running before the save.
- Existing site fields retain their meaning: `root` remains the Host `appBase`; it is not silently
  repurposed as a Context `docBase`.
- Global CATALINA_BASE and a user-selected CATALINA_BASE follow the same configuration behavior.

## Non-goals

- Building, copying, unpacking, or modifying application WAR files.
- Managing application-specific JVM properties, databases, database users, application runtime data,
  or application configuration. For example, OpenMRS's
  `-DOPENMRS_APPLICATION_DATA_DIRECTORY` remains an application/JVM concern.
- Editing or deleting user-managed Context descriptors, rewrite rules, Valves, connectors, or
  certificates.
- Supporting Tomcat 9 `javax.servlet` applications on Tomcat 10+; application/Tomcat compatibility
  remains the operator's responsibility.

## Existing Root Causes

### Context and rewrite are absent

Tomcat site creation currently maps only `AppHost.root` to the Host `appBase` in `server.xml`.
There is no persisted per-site Context data, no user interface for `path` and `docBase`, and no
code that creates `conf/Catalina/<host>/rewrite.config` or adds a RewriteValve.

`Host.handleHost()` deliberately excludes `type: 'tomcat'` from its normal vhost generation path.
Consequently adding, editing, and deleting a Tomcat site do not trigger Tomcat configuration
generation; the eventual `server.xml` generation occurs only when Tomcat starts.

### SSL does not become effective

The same exclusion also skips `updateAutoSSL()`. A Tomcat site with `useSSL: true` and
`autoSSL: true` therefore retains blank `ssl.cert` and `ssl.key`. The Tomcat XML generator creates
an HTTPS connector only when both values are present, so no connector is generated. With manually
selected certificate files, changes to an existing SNI `SSLHostConfig` are also not reconciled,
which can leave a stale certificate/key pair in `server.xml`.

## Alternatives Considered

### A. Managed Context descriptors per Host (recommended)

Store the site model in the existing host list and generate Tomcat's standard per-host Context
descriptors below `CATALINA_BASE/conf/Catalina/<host>/`. A Context path maps deterministically to a
descriptor filename: `/` becomes `ROOT.xml`, `/openmrs` becomes `openmrs.xml`, and `/api/v1`
becomes `api#v1.xml`. Each descriptor contains FlyEnv ownership metadata and the `docBase`.

This is Tomcat's normal external deployment mechanism. It separates application mappings from
`server.xml`, supports any number of Contexts, makes precise cleanup possible, and avoids a
collision with user-managed descriptors.

### B. Embed all Contexts in `server.xml`

This would require fewer files, but it mixes site mapping data with shared Connector and Host
configuration. It is harder to update or remove a single mapping safely, makes manual custom
configuration fragile, and conflicts with Tomcat's deployment model.

### C. Provide only an arbitrary XML/text editor

This is flexible but leaves all validation, ownership, deployment-path derivation, and restart
work to the user. It does not remove the manual deployment steps that this feature targets.

## Design

### Persisted site model

Extend the existing `AppHost` record only for `type: 'tomcat'` with Tomcat-owned data:

```ts
type TomcatContextMapping = {
  id: string
  path: string
  docBase: string
}

type TomcatSiteConfig = {
  contexts: TomcatContextMapping[]
  rewrite: {
    enabled: boolean
    content: string
  }
}
```

`tomcat` is optional on the shared host type so existing PHP and Tomcat records remain readable.
The type and all validation/generation helpers stay under the Tomcat module rather than becoming
generic web-server abstractions. This is not new module-owned configuration in `config.setup`: the
data is part of the existing host record, whose lifetime and persistence already belong to the
Host domain.

For compatibility, a missing `tomcat` field means no managed Contexts and rewrite disabled. FlyEnv
will not infer a Context from `root`: an operator must explicitly add it. That avoids accidentally
mounting a directory that was intended only as an `appBase` and preserves current deployments.

### Context validation and descriptor generation

The Tomcat site drawer adds an **Application mappings** section. It lets the user add, remove, and
reorder mapping rows. A mapping contains:

- **Context path**: must be `/` or begin with `/`; it cannot contain `//`, a query, a fragment,
  backslashes, `.`/`..` path segments, or whitespace-only content. Context paths are unique after
  normalization.
- **Application path (`docBase`)**: absolute, non-empty, existing path; it must be a directory or
  `.war` file. It may be outside the Host `appBase`, which is required for build-output deployments
  such as an external WAR.

The fork owns final filesystem validation and descriptor generation, so validation does not depend
on a mounted renderer. The renderer performs the same inexpensive validation for immediate field
feedback.

For every host alias, FlyEnv generates a descriptor directory under
`CATALINA_BASE/conf/Catalina/<alias>/`. Context filename derivation is centralized and must reject
unsafe path characters before producing a path. Descriptor XML contains an `appFlag="FlyEnv"`
marker, the managed mapping ID, and its `docBase`.

On add/edit/reconciliation, FlyEnv writes the complete desired set of its own descriptors and
removes only descriptors carrying that FlyEnv ownership marker that no longer match the desired
mapping IDs. Unmarked descriptors—including manually created Context files—are never altered. On
site deletion it removes only this site's marked descriptors across its old aliases.

The Host remains `appBase=<root>`, with `unpackWARs="true"`. A Host with at least one managed
descriptor is configured with `deployOnStartup="false"` and `autoDeploy="false"` to prevent
Tomcat from scanning an appBase that may contain build artifacts, while still loading the explicit
Context descriptors at startup. A Host without managed Contexts retains the current automatic
deployment behavior.

### Rewrite configuration

The drawer adds a **Tomcat rewrite** switch and a code editor. The setting is host-level, not
Context-level, because Tomcat's `RewriteValve` and its `rewrite.config` are host-scoped. When
enabled, the fork:

1. Writes the exact editor content to
   `CATALINA_BASE/conf/Catalina/<alias>/rewrite.config`.
2. Adds a `<Valve appFlag="FlyEnv" className="org.apache.catalina.valves.rewrite.RewriteValve"/>`
   to the corresponding FlyEnv-managed Host in `server.xml`.

When disabled or deleted, it removes only the FlyEnv-marked RewriteValve. It removes only a
`rewrite.config` bearing FlyEnv's file marker; a pre-existing user-owned rewrite configuration is
left untouched and will continue to be used by any user-owned RewriteValve. Rename/alias changes
remove stale FlyEnv-owned files from the previous alias directories and generate them for the new
aliases.

OpenMRS can then be expressed without manual file work: configure the mapping
`/openmrs -> /absolute/path/openmrs.war`, enable rewrite, and set
`RewriteRule ^/$ /openmrs/ [R=302,L]`.

### SSL repair

Tomcat mutation becomes a first-class branch of `Host.handleHost()`:

- On add/edit, invoke `updateAutoSSL()` before the host list is persisted. This makes generated
  certificate paths part of the same saved snapshot used by the Tomcat generator.
- On edit, certificate path, certificate content existence, alias, enabled state, and HTTPS port
  changes all cause Tomcat configuration reconciliation.
- On delete, existing CA cleanup remains owned by Host only for automatic certificates, as today.

`makeTomcatServerXML()` becomes the single reconciler for FlyEnv-owned Tomcat connectors and SNI
configuration. For each HTTPS port it calculates the complete desired alias-to-certificate map,
normalizes singleton/array XML shapes, updates marked SNI entries even when they already exist,
adds missing entries, and removes only stale FlyEnv-marked entries. Each HTTPS connector is
explicitly marked as FlyEnv-owned and includes `SSLEnabled="true"`, `scheme="https"`, and
`secure="true"`. Certificate paths are kept absolute rather than resolved relative to
`CATALINA_BASE/conf`.

The HTTPS port's unqualified/default `SSLHostConfig` must not accidentally select a certificate
from the last site processed. The reconciler creates/updates a marked configuration only when a
deterministic default host exists, and all named virtual hosts use named SNI configurations. This
removes iteration-order dependence and makes an unknown SNI host behavior explicit.

### Save and restart operation

The site drawer owns only view state: inputs, mapping rows, field errors, and the Save button. It
does not own IPC callbacks or background service lifecycle.

A Tomcat module-local singleton configuration controller owns the save/reconcile operation:

| Contract item | Definition |
| --- | --- |
| Owner/lifetime | Tomcat module-local singleton; it persists while the renderer module is loaded and is not tied to one drawer instance. |
| Start event | User saves a valid Tomcat site add, edit, or delete. |
| Request snapshot | Immutable new site, previous site, mutation type, and whether Tomcat was running before mutation. |
| Intermediate events | Validation started, host list/config written, Tomcat stopped, Tomcat started. |
| Terminal events | `saved`, `restarted`, or `failed`; only one terminal event clears the in-flight state. |
| Duplicate invocation | A second save while one is running is rejected/disabled; it cannot queue a second restart. |
| Service interaction | Reuse `ModuleInstalledItem.restart()` and the existing `startExtParam` CATALINA_BASE registration. Do not add a parallel Tomcat start/stop API. |
| Cleanup | Every terminal outcome clears the controller's progress/listener state; reopening a drawer reflects persisted host data. |
| Lifecycle tests | Duplicate save, failed reconciliation/retry, running service restarts once, stopped service remains stopped, and page/drawer re-entry during operation. |

The fork applies the host mutation atomically in this order: validate the snapshot, generate/repair
automatic SSL paths, persist the host list, reconcile server.xml and Context/rewrite files for the
effective CATALINA_BASE, then return the updated host list. Before invoking it, the controller
records whether the selected Tomcat version is running. If it was running, the controller calls its
standard `restart()` after a successful fork response; it never starts a previously stopped
service. A failed config write leaves the service running and reports the error; a restart failure
reports the failure without claiming that configuration is active.

At ordinary Tomcat startup, the fork also performs the same server.xml and Context/rewrite
reconciliation for the selected CATALINA_BASE. This makes saved configurations recoverable after a
manual file deletion or application restart, including configurations saved while Tomcat was
stopped.

## OpenMRS Deployment Simplification

With this design, the manual steps from the OpenMRS guide reduce to application-specific work:

| Today | FlyEnv after this feature |
| --- | --- |
| Edit `server.xml` and manually add `<Context>` | Add `/openmrs` and select the built WAR in the Tomcat site drawer. |
| Create `conf/Catalina/<host>/rewrite.config` | Enable rewrite and save the rule in the drawer. |
| Add RewriteValve manually | FlyEnv manages the marked host Valve. |
| Keep an empty dedicated appBase by hand | Choose a dedicated directory as the Host root; FlyEnv disables appBase scanning when explicit Contexts exist. |
| Build compatibility/JVM/database setup | Remains documented, project-specific operator work. |

## Module Boundary Checklist

- No new Pinia store. The configuration controller is module-local and bound with `reactiveBind`.
- No module state is added to `config.setup`; Context/rewrite values live in the existing persisted
  Host record.
- Standard `ModuleInstalledItem.restart()` performs the only service lifecycle action.
- The Tomcat fork module owns generated files and its `server.xml` state; renderer state is not
  treated as proof of service liveness.
- No exception authorization is needed. The existing Host record is the appropriate persistence
  owner for a site definition; all Tomcat-specific fields/helpers remain in Tomcat module paths.

## Verification

- Unit-style `tsx` regression coverage for Context-path validation, descriptor filename derivation,
  external WAR and directory `docBase` generation, multiple mappings, root mapping, duplicates,
  and preservation of user-managed descriptors.
- `makeTomcatServerXML()` coverage for RewriteValve add/update/remove behavior, `autoDeploy`/
  `deployOnStartup` behavior, multiple aliases, and no mutation of user-owned Valves.
- SSL coverage for automatic certificate generation on Tomcat add/edit, exact SNI certificate
  reconciliation after a certificate edit, removal when SSL is disabled, multiple HTTPS ports, and
  proper `secure="true"` Connector generation.
- Renderer-operation boundary regression coverage for a single save/restart flight, final-state
  cleanup after failure/retry, no start for an already stopped Tomcat, and page re-entry.
- A Tomcat `configtest` integration script against a temporary Tomcat distribution when available,
  plus source-level assertions when the test environment does not provide a Tomcat runtime.
- Manual smoke test with a directory Context, an external WAR Context, a root rewrite to a nested
  Context, HTTPS with a FlyEnv certificate, and a save while Tomcat is both running and stopped.
