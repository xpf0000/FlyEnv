export default {
  openAdminPanel: '管理面板',
  adminPanelTitle: 'SamWaf 管理面板',
  initialPasswordTip: '检测到全新安装。请使用账号 admin 和以下随机初始密码登录，并立即修改密码。',
  initialPasswordFileHint: '该密码同时保存在安装目录下的 data/initial_password.txt。',
  adminPanelUnavailable: '请先启动服务，再打开管理面板。',
  portParseFailed: '无法从 conf/config.yml 读取 local_port，已使用默认端口 26666。',
  sha256Mismatch: '下载的安装包 SHA-256 校验失败，已删除。',
  binNotFoundAfterUnpack: '解压后未找到 SamWaf 可执行文件。',
  loopbackWhitelistNote: '默认配置仅允许本机回环地址（127.0.0.1/::1）访问管理面板，如需开放请编辑 conf/config.yml。',
  darwinExperimental: 'macOS 版本由官方发布但未宣称正式支持，请按实验性平台对待。'
}
