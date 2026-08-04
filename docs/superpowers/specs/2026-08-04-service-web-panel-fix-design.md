# Service Web Panel Entry and Address Handling Design

**Goal:** Add the missing Consul Web UI entry and make MinIO and R-Nacos Web UI addresses reliable when configured through FlyEnv.

## Scope

- Consul's service tab gets a browser action for its enabled built-in UI.
- MinIO accepts bare ports and full `host:port` values, strips configuration quotes before spawning, and opens the configured Console address rather than the S3 API address.
- R-Nacos reads `RNACOS_HTTP_CONSOLE_PORT` from its configuration when opening the console.
- No changes to unrelated service modules or to user configuration files outside the repository.

## Design

### Consul

The Consul module already writes `ui_config.enabled: true` into its generated configuration. The renderer will add the existing green HTTP icon pattern to the ServiceManager `tool-left` slot. The button will be shown only while the Consul service is running and will open `/ui/` using the configured HTTP bind port, defaulting to `8500`.

### MinIO

MinIO configuration values are currently written with quotes and then passed through `child_process.spawn` without shell parsing. The fork module will normalize values while parsing the `.conf` file:

- remove one matching pair of single or double quotes;
- for `MINIO_CONSOLE_ADDRESS`, convert a numeric value such as `9015` to `127.0.0.1:9015`;
- preserve valid `:9015` and `host:9015` values;
- pass the normalized values both as environment variables and command arguments.

The renderer's browser action will read `MINIO_CONSOLE_ADDRESS`, normalize it with the same defaults, and open the Console URL. If no static Console address is configured, it will retain the existing `9001` fallback for the normal local setup.

### R-Nacos

The renderer will read `RNACOS_HTTP_CONSOLE_PORT` from `rnacos.conf`, strip comments/whitespace, and default to `10848` when absent or invalid. The console path remains `/rnacos/`.

## Error handling

- Invalid or empty address values fall back to the module's documented local default instead of producing malformed URLs.
- Existing service startup behavior remains unchanged for valid non-console environment variables.
- Browser actions remain disabled/hidden while the service is stopped, following existing module patterns.

## Verification

- Add focused unit-style scripts for address normalization and module-specific URL extraction.
- Run those scripts in isolation first, then run the existing ClickHouse regression test and the relevant TypeScript/build checks.
- Verify the generated diff and confirm no user configuration outside the repository is modified.
