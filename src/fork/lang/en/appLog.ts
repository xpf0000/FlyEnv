export default {
  startInstall: 'Start installing {service}',
  startDown: `Start downloading {service}, Download link: {url}`,
  downSuccess: 'Download completed, install {service}',
  downFail: 'Download failed, installation of {service} failed',
  installSuccess: '{service} installation successful, installation location: {appDir}',
  installFail: '{service} installation failed, reason: {error}',
  installFromZip: 'The installation package already exists, install {service}',
  installFromZipFail:
    'Installation failed, download the installation package again for installation',

  startServiceBegin: 'Start the {service} service...',
  serviceUseBundle: 'Used the built-in version, Started unpacking and installing {service}',
  bundleUnzipSuccess: 'Unzip installation completed, installation location: {appDir}',
  bundleUnzipFail: 'Unzip installation failed, reason: {error}',
  confInit: 'The configuration file does not exist, generate configuration file',
  confInitSuccess: 'Configuration file generated successfully, file path: {file}',
  confInitFail: 'Configuration file generation failed, reason: {error}',
  apachePortHandleBegin: 'Start obtaining all Apache listening ports from the site',
  apachePortHandleEnd:
    'Apache listening port acquisition completed, successfully writing configuration file',
  execStartCommand: 'Start executing the startup command',
  execStartCommandSuccess:
    'Start command executed successfully, start checking if the startup was successful',
  execStartCommandFail:
    'Start command execution failed, reason: {error}, {service} service failed to start',
  startServiceSuccess: '{service} service started successfully, pid: {pid}',
  startServiceFail: '{service} service failed to start, reason: {error}',

  stopServiceBegin: 'Start stopping {service} service',
  stopServiceEnd: '{service} service stopped successfully',

  initDBPass: 'Start initializing database password',
  initDBPassSuccess: 'Initialize database password successfully, account password: {user} {pass}',
  initDBPassFail: 'Failed to initialize database password, reason: {error}',
  initDBDataDir: 'Data folder not found, start initializing data folder',
  initDBDataDirSuccess: 'Initialization of data folder successful, data folder path: {dir}',
  initDBDataDirFail: 'Initialization of data folder failed, reason: {error}',

  initPlugin: 'Start initializing the plugin and execute the command: {command}',
  initPluginSuccess: 'Initialization plugin successful',
  initPluginFail: 'Initialization plugin failed, reason: {error}',

  erlangEnvInit: 'Attempt to initialize the Erlang runtime environment',
  erlangEnvInitEnd: 'Initialization of Erlang runtime environment completed'
}