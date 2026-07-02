export const MCP_LIFECYCLE_FLAGS = [
  'php',
  'nginx',
  'apache',
  'caddy',
  'mysql',
  'redis',
  'memcached',
  'mongodb',
  'mariadb',
  'postgresql',
  'pure-ftpd',
  'tomcat',
  'rabbitmq',
  'mailpit',
  'elasticsearch',
  'ollama',
  'minio',
  'meilisearch',
  'zincsearch',
  'etcd',
  'consul',
  'typesense',
  'qdrant',
  'cliproxyapi',
  'numa',
  'rnacos',
  'frankenphp',
  'roadrunner',
  'swoole-cli',
  'n8n',
  'rustfs'
] as const

export const MCP_QUERYABLE_FLAGS = [
  'apache',
  'bun',
  'caddy',
  'cliproxyapi',
  'cloudflared',
  'composer',
  'consul',
  'deno',
  'dotnet',
  'elasticsearch',
  'etcd',
  'flutter',
  'frankenphp',
  'git',
  'golang',
  'gradle',
  'java',
  'mailpit',
  'mariadb',
  'meilisearch',
  'memcached',
  'minio',
  'mkcert',
  'mongodb',
  'mysql',
  'n8n',
  'nginx',
  'node',
  'numa',
  'ollama',
  'perl',
  'php',
  'postgresql',
  'pure-ftpd',
  'python',
  'qdrant',
  'rabbitmq',
  'redis',
  'rnacos',
  'roadrunner',
  'ruby',
  'rust',
  'rustfs',
  'swoole-cli',
  'tomcat',
  'typesense',
  'zincsearch',
  'zig'
] as const

export const MCP_DATABASE_FLAGS = [
  'mysql',
  'mariadb',
  'postgresql',
  'redis',
  'mongodb',
  'memcached'
] as const

export const MCP_INSTALLABLE_FLAGS = [
  'apache',
  'bun',
  'caddy',
  'cliproxyapi',
  'cloudflared',
  'composer',
  'consul',
  'deno',
  'dotnet',
  'elasticsearch',
  'etcd',
  'flutter',
  'frankenphp',
  'git',
  'golang',
  'gradle',
  'java',
  'mailpit',
  'mariadb',
  'meilisearch',
  'memcached',
  'minio',
  'mkcert',
  'mongodb',
  'mysql',
  'n8n',
  'nginx',
  'numa',
  'ollama',
  'perl',
  'php',
  'postgresql',
  'python',
  'qdrant',
  'rabbitmq',
  'redis',
  'rnacos',
  'roadrunner',
  'ruby',
  'rust',
  'rustfs',
  'swoole-cli',
  'tomcat',
  'typesense',
  'zincsearch',
  'zig'
] as const

const MCP_LIFECYCLE_FLAG_SET = new Set<string>(MCP_LIFECYCLE_FLAGS)
const MCP_QUERYABLE_FLAG_SET = new Set<string>(MCP_QUERYABLE_FLAGS)
const MCP_DATABASE_FLAG_SET = new Set<string>(MCP_DATABASE_FLAGS)
const MCP_INSTALLABLE_FLAG_SET = new Set<string>(MCP_INSTALLABLE_FLAGS)

export function isMcpLifecycleFlag(flag: string): flag is (typeof MCP_LIFECYCLE_FLAGS)[number] {
  return MCP_LIFECYCLE_FLAG_SET.has(flag)
}

export function isMcpQueryableFlag(flag: string): flag is (typeof MCP_QUERYABLE_FLAGS)[number] {
  return MCP_QUERYABLE_FLAG_SET.has(flag)
}

export function isMcpDatabaseFlag(flag: string): flag is (typeof MCP_DATABASE_FLAGS)[number] {
  return MCP_DATABASE_FLAG_SET.has(flag)
}

export function isMcpInstallableFlag(flag: string): flag is (typeof MCP_INSTALLABLE_FLAGS)[number] {
  return MCP_INSTALLABLE_FLAG_SET.has(flag)
}

export const MCP_TOOL_DESCRIPTIONS = {
  listServices:
    'List FlyEnv-managed modules with installed-version inventory and running state. This includes long-running services and inspectable runtimes/toolchains such as bun, node, php, nginx, mysql, python, and golang.',
  serviceStatus:
    'Get installed versions and running state for one version-managed FlyEnv module. This is read-only and never installs, starts, stops, or restarts anything.',
  listSites:
    'List local development sites managed by FlyEnv, including domain, aliases, root path, project type, PHP version, SSL mode, and port-related metadata when available.',
  getDatabaseConnectionInfo:
    'Return connection facts for a FlyEnv-managed local database or cache module, including host, port, socket, credentials, config files, log files, data paths, and executable hints.',
  resolveSiteRuntime:
    'Resolve a FlyEnv-managed site into runtime facts such as site root, detected project runtime, preferred web server, PHP selection, and managed file locations.',
  getServiceExecInfo:
    'Return executable and runtime facts for one version-managed FlyEnv module version, including bin/path, phpBin/phpConfig when present, config files, log files, and execution hints.',
  resolveSiteUrls:
    'Return the canonical URL set for a FlyEnv-managed site, including aliases, preferred server URLs, SSL entrypoints, and reverse proxy declarations.',
  getManagedFileMap:
    'Return important FlyEnv-managed file paths for either a site or a version-managed module, grouped by env/config/log/cert/runtime/data.',
  listLogFiles:
    'List known log files for one version-managed FlyEnv module as {name, path, exists}. This returns paths only, not file contents.',
  listConfigFiles:
    'List known config files for one version-managed FlyEnv module as {name, path, exists}. This returns paths only, not file contents.',
  listOnlineVersions:
    'List downloadable versions for an installable FlyEnv module. Use this before install_service to choose an exact version. This does not install or start anything.',
  startService:
    'Start an already-installed long-running FlyEnv service version, such as nginx, mysql, php, or redis. This tool never downloads or installs missing versions. Runtime/toolchain modules such as bun, node, python, golang, java, rust, deno, or zig are intentionally excluded; use list_online_versions plus install_service for installation tasks.',
  stopService:
    'Stop a running long-lived FlyEnv service. Only lifecycle-managed services are supported here; runtime/toolchain modules such as bun or node are excluded.',
  restartService:
    'Restart a running long-lived FlyEnv service. This only applies to lifecycle-managed services and never installs new versions.',
  createSite:
    'Create a new FlyEnv local development site. This writes FlyEnv host/site configuration and may require follow-up web-server reloads.',
  updateSite:
    'Update an existing FlyEnv local development site. Only the provided fields are changed; omitted fields are left unchanged.',
  deleteSite: 'Delete an existing FlyEnv local development site from FlyEnv configuration.',
  installService:
    'Download and install a version for an installable FlyEnv module, such as bun, php, nginx, mysql, python, or golang. This tool does not start the module after installation; if the module supports lifecycle management, call start_service separately after install.'
} as const

export const MCP_FLAG_DESCRIPTIONS = {
  lifecycle:
    'Lifecycle-managed FlyEnv service flag. Examples: nginx, mysql, php, redis. Excludes runtime/toolchain modules such as bun, node, python, golang, java, rust, deno, and zig.',
  queryable:
    'Version-managed FlyEnv module flag for read-only inspection tools. Examples: bun, node, php, nginx, mysql, python, golang, redis, pure-ftpd. Excludes UI-only modules such as hosts, tools, mcp, codex, kimi, and openCode.',
  database:
    'Database/cache module flag. Allowed values: mysql, mariadb, postgresql, redis, mongodb, memcached.',
  installable:
    'Installable FlyEnv module flag. Examples: bun, php, nginx, mysql, python, golang, mkcert. Use list_online_versions first to see available versions.'
} as const

export const MCP_PARAM_DESCRIPTIONS = {
  installedVersion:
    'Optional installed version string. If omitted, FlyEnv usually prefers the running version, otherwise the enabled/default installed version.',
  lifecycleVersion:
    'Installed version string to operate on. If omitted, FlyEnv uses the current enabled version for that lifecycle-managed service.',
  siteName: 'FlyEnv site domain name, for example "demo.test".',
  siteRoot: 'Absolute filesystem path to the site root directory.',
  siteAlias: 'Optional newline-separated alias hostnames for the site.',
  sitePhpVersion: 'FlyEnv PHP version number used by site config, for example 83 for PHP 8.3.',
  siteUseSsl: 'Whether HTTPS is enabled for the site in FlyEnv.',
  siteAutoSsl: 'Whether FlyEnv should manage/generate SSL assets automatically for the site.',
  siteSslCert: 'Absolute path to a custom SSL certificate file.',
  siteSslKey: 'Absolute path to a custom SSL private key file.',
  siteUrl: 'Optional canonical site URL override, for example "https://demo.test".',
  siteMark: 'Optional FlyEnv site note/mark field.',
  siteBookmark: 'Optional bookmark label stored with the FlyEnv site.',
  siteEnvFile: 'Optional project env file path associated with the site.',
  projectName: 'Optional detected or assigned project runtime name.',
  projectPort: 'Optional upstream project/runtime port used behind the web server.',
  projectStartCommand: 'Optional project start command stored with the site.',
  reverseProxyPath: 'Path prefix for a reverse proxy rule, for example "/api".',
  reverseProxyUrl:
    'Target upstream URL for a reverse proxy rule, for example "http://127.0.0.1:3000".',
  rewriteSnippet: 'Optional Nginx rewrite snippet content managed by FlyEnv.',
  managedFileScope:
    'Select "site" to inspect FlyEnv site-managed files or "service" to inspect files for a version-managed module.',
  managedFileVersion:
    'Optional installed version string for module file lookup. If omitted, FlyEnv prefers the running or enabled installed version.'
} as const
