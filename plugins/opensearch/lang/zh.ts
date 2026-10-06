export default {
  devMode: '本地开发模式',
  devModeDesc:
    '为本地开发关闭 OpenSearch 安全插件：9200 端口走纯 HTTP、无认证。压缩包自带的 demo TLS 配置会被注释保留以便回滚。请勿将开发模式的节点暴露到不可信网络。',
  devModeNoVersion: '请先在服务页面选择 OpenSearch 版本',
  devModeRestartTip: '重启 OpenSearch 服务后生效。',
  devModeRestartNow: '立即重启',
  devModeDisableAdminTip:
    '安全插件已重新启用。OpenSearch 2.12+ 首次启动需要设置 OPENSEARCH_INITIAL_ADMIN_PASSWORD 环境变量。'
}
