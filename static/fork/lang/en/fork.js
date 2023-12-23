module.exports = {
  binNoFound: 'The startup file does not exist, operation failed.',
  confNoFound: 'The configuration file does not exist, the server failed to start',
  apacheLogPathErr: 'The log path of the configuration file is wrong, and the switch fails',
  switchFail: 'Switch Fail',
  needPassWord: 'Sudo needs a computer password, please enter',
  versionError: 'The version is wrong, please select again',
  needSelectVersion: 'Please select a version first',
  serviceNoRun: 'Service not running',
  brewNoFound: 'Brew Not Found',
  getVersionNumFail: 'Failed to get version number',
  hostsFileNoFound: 'hosts file does not exist',
  hostsWriteFail: 'Failed to write /private/etc/hosts file',
  hostsReadFail: 'Failed to read /private/etc/hosts file',
  startFail: 'Failed to start, please check the log file',
  command: 'Command',
  nvmDirNoFound: 'NVM_DIR Not Found',
  phpiniNoFound: 'php.ini file not found',
  ExtensionInstallFail: 'Extension installation failed',
  phpStopFail: 'PHP{version} failed to stop, please try to stop it manually',
  ExtensionInstallFailTips:
    'Install the extension and execute the command:\n{command}\nIf the installation fails, you can try to copy the command and try to install it yourself\n',
  versionNoFound: 'Failed to get software version, operation failed.',
  postgresqlInit:
    'Service started successfully\nData Dir is {dir}\nInitial User is root, Empty password'
}
