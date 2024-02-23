export default {
  name: '站点',
  mark: '备注',
  setup: '操作',
  phpVersion: 'php版本',
  newProject: '新建项目',
  dir: '目录',
  frameWork: '框架',
  newProjectTips:
    '使用composer新建项目, 以选定的框架初始化, 支持: wordpress, laravel, yii2, symfony, thinkphp, codeIgniter, cakephp, slim',
  toCreateHost: '创建站点',
  dnsInfo:
    '开启一个DNS服务器.把/etc/hosts文件中设置的域名解析成本机ip.主要用于局域网内其他电脑或手机访问本机站点. \n' +
    '此功能需要node, 如果未安装, 请先安装\n' +
    '使用方法:\n' +
    '1. 启动DNS服务器\n' +
    '2. 在其他电脑或手机上, 设置网络的DNS, 输入当前界面显示的DNS IP. 最好是只保留这一个DNS设置, 不再使用后, 再恢复原来的设置\n' +
    '3. 使用此命令测试: dig {ip} 域名\n' +
    '4. 在其他电脑或手机上, 使用本机站点的域名进行访问',
  staticSite: '静态站点',
  park: '生成子站点',
  hostsCopy: '复制hosts文本',
  hostsOpen: '打开自定义hosts文件',

  placeholderName: '站点域名 eg: www.xxx.com',
  placeholderAlias: '站点域名别名 eg: www.xxx.com',
  placeholderRemarks: '备注',
  placeholderRootPath: '站点根目录',
  hostPort: '端口',
  hostSSL: 'SSL证书',

  parkConfim: '确定根据子目录生成站点?'
}
