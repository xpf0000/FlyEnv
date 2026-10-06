export default {
  devMode: 'Local Development Mode',
  devModeDesc:
    'Disables the OpenSearch security plugin for local development: plain HTTP on port 9200, no authentication. The bundled demo TLS settings are commented out (kept for rollback). Never expose a dev-mode node to an untrusted network.',
  devModeNoVersion: 'Select an OpenSearch version in the Service tab first',
  devModeRestartTip: 'Restart the OpenSearch service for the change to take effect.',
  devModeRestartNow: 'Restart now',
  devModeDisableAdminTip:
    'Security plugin re-enabled. On OpenSearch 2.12+ the first start requires the OPENSEARCH_INITIAL_ADMIN_PASSWORD environment variable.'
}
