export default {
  devMode: 'Local Development Mode',
  devModeDesc:
    'Disables the OpenSearch security plugin for local development: plain HTTP on port 9200, no authentication. The bundled demo TLS settings are commented out (kept for rollback). Never expose a dev-mode node to an untrusted network.',
  devModeNoVersion: 'Select an OpenSearch version in the Service tab first',
  devModeRestartTip: 'Restart the OpenSearch service for the change to take effect.',
  devModeRestartNow: 'Restart now',
  devModeDisableAdminTip:
    'Security plugin re-enabled. On OpenSearch 2.12+ the first start requires the OPENSEARCH_INITIAL_ADMIN_PASSWORD environment variable.',
  dashboards: 'Open Dashboards',
  dashboardsOpening: 'Opening OpenSearch Dashboards…',
  dashboardsNoRunningVersion: 'Start a valid OpenSearch version before opening Dashboards.',
  dashboardsOpenFailed: 'OpenSearch Dashboards could not be opened.',
  dashboardsBrowserOpenFailed:
    'OpenSearch Dashboards is ready, but the browser could not be opened.',
  dashboardsDevModeOnly: 'Dashboards currently supports OpenSearch local development mode only.',
  dashboardsVersionMismatch:
    'Dashboards version {actual} does not match OpenSearch version {expected}.',
  dashboardsUnsupportedPlatform: 'OpenSearch Dashboards is not supported on this platform.',
  dashboardsInstalling: 'Installing OpenSearch Dashboards…',
  dashboardsStarting: 'Starting OpenSearch Dashboards…',
  dashboardsReadyTimeout: 'Timed out while waiting for OpenSearch Dashboards to become ready.',
  dashboardsStopFailed: 'Could not stop OpenSearch Dashboards process {pid}: {error}',
  dashboardsPartialStop:
    'Shutdown was partial; confirmed stopped process IDs: {pids}. Errors: {error}',
  dashboardsVersionInvalid: 'The running OpenSearch version could not be verified.',
  dashboardsBackendPortInvalid: 'The OpenSearch backend port is invalid.',
  dashboardsAuthUnsupported:
    'Authenticated OpenSearch clusters are not supported by Dashboards yet.',
  dashboardsBackendUnavailable:
    'The running OpenSearch backend could not be reached (HTTP {status}).',
  dashboardsBackendConnectFailed:
    'OpenSearch did not become reachable at {url} within 60 seconds: {error}',
  dashboardsTlsUnsupported: 'TLS secured OpenSearch clusters are not supported by Dashboards yet.',
  dashboardsArchiveInvalid: 'The downloaded OpenSearch Dashboards archive is invalid.',
  dashboardsHomebrewVersionUnavailable:
    'Could not find the matching Homebrew Dashboards version {version}.',
  dashboardsNodeMissing: 'Node.js is required to install OpenSearch Dashboards on this platform.',
  dashboardsStartPidMissing: 'OpenSearch Dashboards started without a verifiable process ID.',
  dashboardsOpenCancelled: 'OpenSearch Dashboards startup was cancelled.',
  dashboardsStartTimeout:
    'OpenSearch Dashboards did not become ready in time (PID {pid}): {detail}. Logs: {logs}',
  dashboardsCleanupFailed: 'Could not clean up OpenSearch Dashboards process {pid}: {error}',
  dashboardsInstanceInvalid: 'The OpenSearch Dashboards instance could not be verified.',
  dashboardsStopPartial:
    'Shutdown was partial; confirmed stopped process IDs: {pids}. Errors: {errors}'
}
