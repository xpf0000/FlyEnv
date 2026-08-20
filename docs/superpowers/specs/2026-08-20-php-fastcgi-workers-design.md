# PHP FastCGI Worker Count Design

## Goal

Allow Windows users to configure the `php-cgi-spawner.exe` worker count for each installed PHP version. The default remains `4` when no value has been saved.

## User Interface

In `PHP -> Service`, each Windows PHP version row exposes a `FastCGI Worker Count` action in its existing overflow menu. The label includes the effective value, for example `FastCGI Worker Count (10)` or `FastCGI Worker Count (4)` when the version has no stored override.

The action opens a compact dialog showing the PHP version, a numeric worker-count input, valid limits, and an explanation that the value is applied when the service starts. Saving persists the value and offers a restart when that PHP version is currently running. The action is not displayed on macOS or Linux because those platforms use php-fpm configuration instead of `php-cgi-spawner.exe`.

## Persistence And Ownership

The PHP Windows fork module owns the setting and reads it immediately before launching `php-cgi-spawner.exe`. It persists the settings in a module runtime file:

`<FlyEnv data directory>/server/php/fastcgi-workers.json`

The file maps a canonical, case-normalized PHP installation directory to an integer worker count. The identity is the installation directory rather than FlyEnv's transient PHP `num`, so a custom version keeps its setting after installed-version scanning changes its number.

```json
{
  "c:/flyenv-data/server/php/8.4.24": 10,
  "d:/tools/php/8.3.15": 4
}
```

The value is intentionally not stored in `php.ini`, `php-fpm.conf`, `config.setup`, or renderer localForage. It is a Windows spawner argument, and fork-owned file persistence is available to every process that can start PHP.

## Lifecycle Contract

| Item | Contract |
| --- | --- |
| Owner | `Php.win` fork module owns persistence, validation, and launch-time lookup. |
| Save event | The renderer calls an explicit PHP fork command with an installed-version snapshot and requested count. |
| Start event | Every `Php.win.startService(version)` reads the stored count, then passes it as argument three to `php-cgi-spawner.exe`. |
| Intermediate events | Existing service start log/progress events remain unchanged. |
| Terminal events | Saving resolves after an atomic write; starting resolves or rejects through the existing service lifecycle result. |
| Duplicate save | Writes are serialized; the last valid request wins. |
| Restart | A currently running selected PHP version can be restarted after a successful save. |
| Invalid values | Non-integers and values outside the declared range are rejected in both renderer and fork. |

Because the fork reads the file at launch time, all existing launch routes get the same effective configuration: the PHP service row, startup groups, automatic service startup, MCP `start_service`/`restart_service`, and MCP site creation that starts PHP. No renderer `startExtParam` is used for this setting because MCP directly invokes the fork from the main process.

## Scope

The initial control changes only worker count. It does not add undocumented `php-cgi-spawner.exe` options such as maximum requests per worker or restart policies.

## Verification

- An unconfigured PHP version launches with argument `4` and its menu shows `4`.
- Saving `10` for PHP 8.4 causes the next launch to pass `10`.
- Another PHP installation continues to use its own saved value or `4`.
- Service-row restart, startup-group launch, automatic service startup, and MCP launch all obtain the value from the same fork lookup.
- Invalid counts do not change the file or launch argument.
- Missing or malformed settings files fall back safely to `4`.
