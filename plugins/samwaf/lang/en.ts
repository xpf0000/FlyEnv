export default {
  openAdminPanel: 'Admin Panel',
  adminPanelTitle: 'SamWaf Admin Panel',
  initialPasswordTip:
    'Fresh install detected. Sign in with account "admin" and the random initial password below, then change it immediately.',
  initialPasswordFileHint: 'Also stored in data/initial_password.txt inside the install directory.',
  adminPanelUnavailable: 'Start the service first to open the admin panel.',
  portParseFailed: 'Could not read local_port from conf/config.yml, using 26666.',
  sha256Mismatch: 'Downloaded archive failed SHA-256 verification and was removed.',
  binNotFoundAfterUnpack: 'SamWaf executable not found after unpacking the archive.',
  loopbackWhitelistNote:
    'The default config only allows loopback (127.0.0.1/::1) to access the admin panel. Edit conf/config.yml to expose it.',
  darwinExperimental:
    'macOS builds are published by upstream but not advertised as supported; treat this platform as experimental.'
}
