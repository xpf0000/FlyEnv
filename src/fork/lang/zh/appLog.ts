export default {
  startInstall: '开始安装{service}',
  startDown: `开始下载{service}, 下载链接: {url}`,
  downSuccess: '下载完毕, 安装{service}',
  downFail: '下载失败, 安装{service}失败, 原因: {error}',
  installSuccess: '{service}安装成功, 安装位置: {appDir}',
  installFail: '{service}安装失败, 原因: {error}',
  installFromZip: '安装包已存在, 安装{service}',
  installFromZipFail: '安装失败, 原因: {error}. 重新下载安装包进行安装',

  startServiceBegin: '开始启动{service}服务',
  serviceUseBundle: '使用了内置版本, 开始解压安装{service}',
  bundleUnzipSuccess: '解压安装完毕, 安装位置: {appDir}',
  bundleUnzipFail: '解压安装失败, 原因: {error}',
  confInit: '配置文件不存在, 生成配置文件',
  confInitSuccess: '配置文件生成成功, 文件路径: {file}',
  confInitFail: '配置文件生成失败, 原因: {error}',
  apachePortHandleBegin: '开始从站点中获取全部Apache监听端口',
  apachePortHandleEnd: 'Apache监听端口获取完毕, 写入配置文件成功',
  execStartCommand: '开始执行启动命令',
  execStartCommandSuccess: '启动命令执行成功, 开始检测是否启动成功',
  execStartCommandFail: '启动命令执行失败, 原因: {error}, {service}服务启动失败',
  startServiceSuccess: '{service}服务启动成功, pid: {pid}',
  startServiceFail: '{service}服务启动失败, 原因: {error}',

  stopServiceBegin: '开始停止{service}服务',
  stopServiceEnd: '{service}服务停止成功'
}
