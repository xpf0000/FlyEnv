export default {
  settings: 'Settings',
  unsupportedArchitecture: 'SQL Server requires x64 Windows or Linux. ARM64 is not supported.',
  operationTimeout:
    'The SQL Server operation timed out. Check its logs and refresh before retrying.',
  operationFailed: 'SQL Server operation failed',
  operationInProgress: 'An installation or removal is still running for this SQL Server version.',
  rescanFailed:
    'The operation completed, but the installed-version list could not be refreshed. Refresh the Service page.',
  windowsServiceUnknown:
    'The Windows service state could not be confirmed. Refresh and check services.msc before retrying.',
  windowsServiceAlreadyRunning:
    'This SQL Server service is already running outside FlyEnv. Stop it in services.msc before starting it here.',
  windowsServiceNotOwned:
    'The SQL Server service PID no longer matches the instance started by FlyEnv. The external service was left untouched.',
  mediaInvalid:
    'The SQL Server download did not produce a complete, unambiguous installation media with setup.exe.',
  checksumMissing:
    'The Microsoft package index does not contain a valid SHA256 checksum for this package.',
  ownedInstallRequired:
    'This operation requires a SQL Server installation directory owned by this plugin.',
  installDirectoryExists:
    'The SQL Server installation directory already exists. Refresh the installed list before retrying.',
  bubblewrapRequired:
    'SQL Server on Linux requires Bubblewrap to keep its system files in the FlyEnv data directory. Install it with sudo apt install bubblewrap, then retry. The system must allow unprivileged user namespaces.',
  linuxRuntimeNotice:
    'Linux requires Bubblewrap (sudo apt install bubblewrap) and unprivileged user namespaces. Database files stay in the FlyEnv data directory.',
  initialPasswordNotice:
    'This password is used for first initialization; changing this setting does not reset an existing sa account.',
  saPassword: 'sa Password',
  saPasswordPlaceholder: 'Password for the built-in sa account',
  saPasswordRule:
    'At least 8 characters, containing three of: uppercase, lowercase, digits, symbols',
  saPasswordInvalid:
    'Invalid sa password: at least 8 characters with three of uppercase, lowercase, digits and symbols',
  saPasswordRequired:
    'A strong sa password is required before the first start. Open Settings on this page to set it.',
  port: 'Port',
  invalidPort: 'Invalid port: must be an integer between 1 and 65535',
  eulaDialogTitle: 'Microsoft SQL Server License Terms',
  eulaCheckboxLabel: 'I have read and accept the Microsoft SQL Server End-User License Agreement',
  eulaLinkText: 'Read the license terms (aka.ms/useterms)',
  memoryNotice:
    'SQL Server requires at least 2 GB of memory to start; about 6 GB of disk space is needed.',
  developerEditionNote:
    'Developer edition: free, for development and testing only, not for production use',
  eulaRequired:
    'Installation requires explicit acceptance of the Microsoft SQL Server EULA. Accept it in the install dialog first.',
  windowsInstallerLaunched:
    'The SQL Server installer has been launched. Finish the setup wizard (UAC and license acceptance are handled by the installer), then refresh the installed list on the Service page.',
  windowsDownloadOnly:
    'Windows does not support silent install here; the official installer is launched after download.',
  distroUnsupported:
    'Only Ubuntu 22.04/24.04 (x64) repositories are supported by this version of the plugin; other distributions return an empty list (rpm support is planned).',
  repoProbeFailed: 'Failed to fetch the Microsoft package repository index: {error}',
  debUnpackFailed: 'Failed to unpack the deb package: {error}',
  debContentInvalid: 'The unpacked deb does not contain opt/mssql/bin/sqlservr',
  instanceScanItemSkipped:
    'Skipped a broken SQL Server instance registry entry ({instance}): {error}',
  windowsServiceDenied:
    'Permission denied while controlling the Windows service {service}. Run FlyEnv as administrator, or start/stop the service manually (services.msc).',
  windowsServiceStartFailed: 'Failed to start the Windows service {service}: {error}',
  windowsServiceStopFailed: 'Failed to stop the Windows service {service}: {error}',
  windowsServiceTimeout:
    'Timed out waiting for the Windows service {service} to reach state {state}',
  serviceNameUnknown:
    'The SQL Server Windows service name is unknown for this instance. Refresh the installed list and try again.',
  startFailDiagnostics: 'sqlservr exited during startup. Recent output:\n{log}',
  manifestInvalid: 'Invalid flyenv-runtime.json in {dir}: {error}',
  installConfirmTitle: 'Install SQL Server',
  installSuccess: 'SQL Server files are in place. Start the service from the Service page.',
  editSettings: 'Initial sa password / port',
  uninstallConfirm: 'Remove the unpacked SQL Server {version} files from {path}?'
}
