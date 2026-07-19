import type { Configuration } from 'electron-builder'
import AfterSign from '../build/afterSign'

const conf: Configuration = {
  productName: 'FlyEnv',
  executableName: 'FlyEnv',
  buildVersion: '4.17.0',
  electronVersion: '39.8.7',
  appId: 'phpstudy.xpfme.com',
  asar: true,
  directories: {
    output: 'release'
  },
  files: [
    'dist/electron/**/*',
    'dist/render/**/*',
    '!**/node_modules/*/{CHANGELOG.md,README.md,README,readme.md,readme,LICENSE}',
    '!**/node_modules/*/{test,__tests__,tests,powered-test,example,examples}',
    '!**/node_modules/*.d.ts',
    '!**/node_modules/.bin',
    '!**/node_modules/node-pty/build/node_gyp_bins',
    // node-pty ships prebuilds for all platforms; Windows build is x64-only, keep only win32-x64
    '!**/node_modules/node-pty/prebuilds/{darwin-arm64,darwin-x64,linux-arm64,linux-x64,win32-arm64}/**',
    '!**/node_modules/node-pty/third_party/conpty/*/win10-arm64/**'
  ],
  artifactName: 'FlyEnv-Setup-${version}.${ext}',
  win: {
    artifactName: 'FlyEnv-Setup-${version}.${ext}',
    asarUnpack: ['**/*.node', '**/node_modules/sharp/**/*', '**/node_modules/@img/**/*'],
    extraResources: [
      {
        from: 'src/helper-go/dist/flyenv-helper-windows-amd64-v1.exe',
        to: 'app.asar.unpacked/node_modules/helper/flyenv-helper.exe'
      }
    ],
    // Windows release signing is performed from GitHub workflow artifacts via the
    // SignPath trusted-build connector. Electron Builder does not submit signing requests.
    icon: 'build/icon.ico',
    target: [
      {
        target: 'nsis',
        arch: ['x64']
      },
      {
        target: 'portable',
        arch: ['x64']
      }
    ]
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    allowElevation: true
  },
  portable: {
    artifactName: 'FlyEnv-Portable-${version}.${ext}',
    unpackDirName: 'FlyEnv-Portable-${version}'
  },
  publish: [],
  // Move the helper into its final path before the workflow collects unsigned PE files.
  afterSign: AfterSign
}

export default conf
