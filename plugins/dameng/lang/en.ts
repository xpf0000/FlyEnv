export default {
  chooseInstallDirectory: 'Choose the final Dameng installation directory',
  installDirectory: 'Installation directory',
  installDirectoryRule:
    'Choose the final empty installation directory. Use only English letters, digits and underscores in every folder name, including parent folders. Spaces, Chinese characters, dots and hyphens are not supported. The installed directory is added to Custom version directories automatically.',
  installDirectoryInvalid:
    'Enter an absolute installation path with only English letters, digits and underscores in every folder name.',
  validateInstallDirectory: 'Validating installation directory',
  browseDirectory: 'Choose directory',
  confirmDownload: 'Confirm and download',
  registrationPending:
    'Dameng software is installed, but its custom-version directory could not be saved. Retry to register the existing installation without reinstalling',
  registrationSaveTimeout: 'Saving the custom-version directory timed out',
  settings: 'Session credentials / initialization defaults',
  sessionNotice:
    'Passwords stay in this FlyEnv session only. Enter the current SYSDBA password again after restarting FlyEnv or changing it in the database. These fields do not change existing accounts.',
  initialSysdbaPassword: 'Initial SYSDBA password',
  initialSysdbaHelp:
    'Set the login password for SYSDBA, the built-in database administrator created during initialization. FlyEnv uses this password to check startup and query instance information; it stays in this session only.',
  currentSysdbaHelp:
    'Enter the existing database administrator SYSDBA login password. For a database created by FlyEnv, this is the initial SYSDBA password you set, unless you changed it in the database. This field does not reset the password.',
  auditorHelp:
    'Set the login password for SYSAUDITOR, the built-in audit account. This is a separate account from SYSDBA and its password is also required for initialization.',
  generatePassword: 'Generate',
  initialPasswordMissing: 'Please enter or generate {field}.',
  initialPasswordInvalid:
    '{field} is invalid. Use 9–48 characters with uppercase, lowercase, a digit and a symbol; exclude whitespace, double quotes and backslashes.',
  initializationCanceled: 'Startup canceled.',
  sysdbaPassword: 'Current SYSDBA password',
  auditorPassword: 'Initial SYSAUDITOR password',
  passwordRequired:
    'Enter the current SYSDBA password in Settings before starting or querying this instance.',
  initPasswordRequired: 'SYSDBA and SYSAUDITOR passwords are required for initialization.',
  passwordRule:
    'Initial passwords: 9–48 characters with uppercase, lowercase, digit and symbol; no whitespace, double quotes or backslashes.',
  passwordInvalid:
    'Invalid initial password. Use 9–48 characters with uppercase, lowercase, digit and symbol; exclude whitespace, double quotes and backslashes.',
  currentPasswordInvalid:
    'The current password cannot contain double quotes, backslashes or control characters.',
  initialize: 'Initialize database',
  resumeInitialization: 'Complete database registration',
  resumeInitializationNotice:
    'The database was already created. This only completes service registration; existing database settings and account passwords stay unchanged. Enter the actual current SYSDBA password in Settings before starting if it is missing or has changed.',
  initialized: 'Initialized',
  uninitialized: 'Not initialized',
  initializeNotice:
    'Initialize this installation once. Page size, extent size, character set and case sensitivity cannot be changed later. Existing data is never overwritten.',
  initializationRequired: 'Initialize the database from its service action menu before starting.',
  immutable: 'Immutable database options',
  resourceDefaults: 'Development resource settings',
  resourceEstimate:
    'Configured buffer: {memory} MiB; initial database: at least {disk} MiB (three 128 MiB tablespaces and two redo logs). Total memory and disk use will be higher.',
  resourceUnverified:
    'These development defaults still require validation with the target DM8 package.',
  port: 'Port',
  pageSize: 'Page size (KB)',
  extentSize: 'Extent size (pages)',
  charset: 'Character set',
  caseSensitive: 'Case sensitive',
  bufferMB: 'Buffer (MB)',
  logSizeMB: 'Each redo log (MB)',
  invalidSettings: 'Invalid initialization settings. Check the port and resource values.',
  settingsSaveFailed: 'The database was initialized, but its defaults could not be saved',
  instanceInfo: 'Version / license information',
  serverVersion: 'Server version',
  expiry: 'License expiry',
  unknown: 'Unknown',
  operationFailed: 'Dameng operation failed',
  readTimeout: 'The information request timed out. Refresh to try again.',
  operationInProgress:
    'An installation, initialization or removal is still running for this installation.',
  operationTimeout:
    'The operation timed out; its result is unknown. Check the installation and logs. This operation cannot be replayed during this session.',
  outcomeUnknown:
    'This installation has an unknown or incomplete operation outcome. Check its files and logs before restarting FlyEnv; do not reinstall over existing files.',
  rescanFailed:
    'The operation completed, but the installed list could not be refreshed. Refresh the Service page.',
  installComplete:
    'Dameng software installed. Initialize its database from the service action menu.',
  initializeComplete: 'Dameng database initialized.',
  uninstallComplete: 'Dameng software uninstalled; database files are retained.',
  uninstallConfirm:
    'Run the official uninstaller for Dameng {version} at {path}? The owned instance must stop normally first. Database files are retained.',
  notRunning: 'Start this instance before querying its version and license.',
  configUnavailable: 'Select an initialized instance to edit its dm.ini.',
  progress: 'Operation progress'
}
