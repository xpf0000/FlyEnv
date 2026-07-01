export const MCP_ALL_TOOLS = [
  'list_services',
  'service_status',
  'list_log_files',
  'list_config_files',
  'list_online_versions',
  'list_sites',
  'get_database_connection_info',
  'resolve_site_runtime',
  'get_service_exec_info',
  'resolve_site_urls',
  'get_managed_file_map',
  'start_service',
  'stop_service',
  'restart_service',
  'create_site',
  'update_site',
  'delete_site',
  'install_service'
] as const

export const MCP_DEFAULT_ENABLED_TOOLS = [
  'list_services',
  'service_status',
  'list_log_files',
  'list_config_files',
  'list_online_versions',
  'list_sites',
  'get_database_connection_info',
  'resolve_site_runtime',
  'get_service_exec_info',
  'resolve_site_urls',
  'get_managed_file_map',
  'start_service',
  'stop_service',
  'restart_service',
  'create_site',
  'update_site'
] as const

export const MCP_RISKY_TOOLS = [
  'start_service',
  'stop_service',
  'restart_service',
  'create_site',
  'update_site',
  'delete_site',
  'install_service'
] as const

export const MCP_DEFAULT_APPROVAL = {
  start_service: 'confirm',
  stop_service: 'confirm',
  restart_service: 'confirm',
  create_site: 'confirm',
  update_site: 'confirm',
  delete_site: 'confirm',
  install_service: 'confirm'
} as const

export type MCPToolName = (typeof MCP_ALL_TOOLS)[number]
export type MCPApprovalPolicy = 'auto' | 'confirm'
