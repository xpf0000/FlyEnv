import type en from './en'

export default {
  chooseInstallDirectory: '选择达梦程序的最终安装目录',
  installDirectory: '安装目录',
  installDirectoryRule:
    '请选择达梦程序的最终安装空目录。完整路径中的每一级文件夹名称只能使用英文字母、数字、下划线，不支持空格、中文、点号或连字符。安装完成后会自动添加到自定义版本目录。',
  installDirectoryInvalid: '请输入绝对安装路径，每一级文件夹名称只能使用英文字母、数字、下划线。',
  validateInstallDirectory: '正在校验安装目录',
  browseDirectory: '选择目录',
  confirmDownload: '确认并下载',
  registrationPending:
    '达梦程序已安装，但无法保存自定义版本目录。请重试以登记已有安装，不会重新运行安装器',
  registrationSaveTimeout: '保存自定义版本目录超时',
  settings: '会话凭据 / 初始化默认设置',
  sessionNotice:
    '密码仅保留在本次 FlyEnv 会话中。重启 FlyEnv 或在数据库中修改密码后，请重新输入当前 SYSDBA 密码；此处不会修改已有账户。',
  initialSysdbaPassword: '初始 SYSDBA 密码',
  initialSysdbaHelp:
    '为初始化时创建的内置数据库管理员 SYSDBA 设置登录密码。FlyEnv 会使用它检查启动结果和查询实例信息，密码仅保留在本次会话中。',
  currentSysdbaHelp:
    '请输入已有数据库管理员 SYSDBA 的登录密码。如果数据库由 FlyEnv 创建，就是初始化时设置的“初始 SYSDBA 密码”；在数据库中改过密码则填写新密码。此处不会重置密码。',
  auditorHelp:
    '为内置审计账户 SYSAUDITOR 设置登录密码。它与 SYSDBA 是两个不同的账户，初始化时也必须设置此密码。',
  generatePassword: '生成密码',
  initialPasswordMissing: '请填写或生成{field}。',
  initialPasswordInvalid:
    '{field}无效：须为 9–48 个字符，包含大写、小写、数字和符号，且不含空白、双引号或反斜杠。',
  initializationCanceled: '已取消启动。',
  sysdbaPassword: '当前 SYSDBA 密码',
  auditorPassword: '初始 SYSAUDITOR 密码',
  passwordRequired: '启动或查询前，请在设置中输入当前 SYSDBA 密码。',
  initPasswordRequired: '初始化需要 SYSDBA 和 SYSAUDITOR 密码。',
  passwordRule: '初始密码为 9–48 个字符，包含大写、小写、数字和符号；不含空白、双引号或反斜杠。',
  passwordInvalid:
    '初始密码无效：须为 9–48 个字符，包含大写、小写、数字和符号，且不含空白、双引号或反斜杠。',
  currentPasswordInvalid: '当前密码不能包含双引号、反斜杠或控制字符。',
  initialize: '初始化数据库',
  resumeInitialization: '完成数据库注册',
  resumeInitializationNotice:
    '数据库已经创建，此操作仅完成服务注册，不会更改已有数据库参数或账户密码。若会话中未保存当前 SYSDBA 密码或密码已更改，请在启动前到设置中输入实际密码。',
  initialized: '已初始化',
  uninitialized: '未初始化',
  initializeNotice:
    '此安装仅初始化一次。页大小、簇大小、字符集和大小写敏感选项建库后不可更改；不会覆盖已有数据。',
  initializationRequired: '请先从服务操作菜单初始化数据库，再启动服务。',
  immutable: '建库后不可变选项',
  resourceDefaults: '开发环境资源设置',
  resourceEstimate:
    '配置缓冲区：{memory} MiB；初始数据库至少占用 {disk} MiB（三个 128 MiB 表空间及两个重做日志）。实际内存及磁盘总用量会更高。',
  resourceUnverified: '此开发默认配置仍需使用目标 DM8 安装包验证。',
  port: '端口',
  pageSize: '页大小（KB）',
  extentSize: '簇大小（页）',
  charset: '字符集',
  caseSensitive: '大小写敏感',
  bufferMB: '缓冲区（MB）',
  logSizeMB: '单个重做日志（MB）',
  invalidSettings: '初始化参数无效，请检查端口和资源数值。',
  settingsSaveFailed: '数据库已初始化，但无法保存默认设置',
  instanceInfo: '版本 / 授权信息',
  serverVersion: '服务端版本',
  expiry: '授权到期时间',
  unknown: '未知',
  operationFailed: '达梦操作失败',
  readTimeout: '信息请求超时，请刷新后重试。',
  operationInProgress: '此安装的安装、初始化或卸载操作仍在执行。',
  operationTimeout: '操作超时，结果未知。请检查安装目录与日志；本次会话禁止重放此操作。',
  outcomeUnknown:
    '此安装有结果未知或未完成的操作。请检查文件和日志后再重启 FlyEnv，不要覆盖现有文件重新安装。',
  rescanFailed: '操作已完成，但无法刷新已安装列表，请刷新服务页。',
  installComplete: '达梦程序已安装，请从服务操作菜单初始化数据库。',
  initializeComplete: '达梦数据库已初始化。',
  uninstallComplete: '达梦程序已卸载，数据库文件已保留。',
  uninstallConfirm:
    '使用官方卸载器卸载 {path} 中的达梦 {version}？必须先正常停止自有实例；数据库文件将保留。',
  notRunning: '请先启动此实例，再查询版本与授权信息。',
  configUnavailable: '请选择已初始化的实例以编辑 dm.ini。',
  progress: '操作进度'
} satisfies Record<keyof typeof en, string>
