import type { Configuration } from 'electron-builder'
import AfterSign from '../build/afterSign'

const conf: Configuration = {
  productName: 'FlyEnv',
  executableName: 'FlyEnv',
  buildVersion: '4.13.1',
  electronVersion: '35.7.5',
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
    '!**/node_modules/node-pty/build/node_gyp_bins'
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
    signExts: ['flyenv-helper.exe'],
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
  },
  publish: [],
  afterSign: AfterSign
}

export default conf
