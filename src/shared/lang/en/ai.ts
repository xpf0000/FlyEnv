export default {
  选择站点目录: 'Select Site Directory',
  选择文件夹: 'Select Folder',

  错误类型: 'Error Type',
  type403: `A 403 generally identifies a lack of permissions, which can be investigated in the following ways
  1. the folder belongs to the user, whether it is the current login user or root, if not, it is recommended to change the folder
  2. Folder execution permissions, whether 755 or 777, the software will update the folder permissions to 755 by default when adding sites, but if the folder is in some system directories, you may not be able to change, it is recommended to change the folder.
  3. service startup users, such as nginx startup users, apache startup users, the default configuration of the software are theoretically correct and available, if you modify the configuration file, you can try to retry using the default configuration`,
  type404: `404 generally indicates that the corresponding page file has not been found, you can investigate from the following aspects
  1. the site directory when there is a corresponding page file, if it is the root directory, whether there is index.php or index.html
  2. nginx or apache configuration file, whether to modify the default document
  3. 3. some projects need to configure pseudo-static, such as ThinkPHP, Laravel, etc., apache's pseudo-static file, the project generally contains a pseudo-static file, the use of nginx, you need to add when adding the site to add`,
  type502: `50X generally identifies the project execution error or execution timeout, but the use of domain access, the use of global VPN, will also report 502 errors, it is recommended to turn off the global VPN and try again!`,

  任务已终止: 'Tasks have been aborted',
  当前有任务正在执行: 'There is a task in progress, please wait for the task to finish.',
  尚不能执行此任务:
    'This task cannot be executed yet, please select it from the currently available tasks.',

  未发现可用版本: 'No available version found, please install first',
  Apache服务启动成功: 'Apache service started successfully',
  服务启动失败端口占用: `Service startup failed with error reason:
{err}
Reason for error recognized: Port occupation, try to terminate the process occupying the port`,

  成功创建站点: 'Successfully created site',
  站点域名: 'Site Domain',
  站点目录: 'Site Directory',
  尝试开启服务: 'Trying to start the service, please wait...',
  服务启动成功: 'Service started successfully',
  域名: 'Domain',
  已在浏览器中打开: 'Already open in your browser, please check',
  服务启动失败: `Service failed to start, cause.
{err}
Please try to start the service manually`,

  MariaDB服务启动成功: 'MariaDB service started successfully',
  Memcached服务启动成功: 'Memcached service started successfully',
  Mysql服务启动成功: 'Mysql service started successfully',
  Nginx服务启动成功: 'Nginx service started successfully',
  Php服务启动成功: 'Php{num} service started successfully',

  尝试启动Apache服务: 'Try starting the Apache service...',

  请输入或选择站点目录: 'Please enter or select a site directory',
  站点目录无效: 'Site directory invalid, task aborted',
  请输入站点域名: 'Please enter the domain name of the site, e.g: www.test.com',
  域名无效: 'Domain name invalid, task aborted',
  创建站点中: 'Create site...',

  请查看日志: 'Please check the {flag} log, and send me the error message.',
  识别到端口占用:
    'Reason for error recognized: Port occupation, try to terminate the process occupying the port',
  未识别到错误原因:
    'The cause of the error has not been identified, cannot be processed at this time, wait for the update',
  识别到Socket占用:
    'Reason for error recognized: Socket file occupation, try to terminate the process occupying the socket file.',
  尝试启动Nginx服务: 'Try starting the Nginx service...',
  站点错误码是否以下几种: 'Are site error codes of the following?',
  任务执行失败: `Task execution failed due to.
 {err}`,

  我是pipi: `Hi, I'm pipi. How can I help you?`,
  你的要求: 'You can directly enter your requirements, such as a new site'
}
