import type { Configuration } from 'electron-builder'

const conf: Configuration = {
  productName: 'FlyEnv',
  executableName: 'PhpWebStudy',
  buildVersion: '4.9.12',
  electronVersion: '37.2.0',
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
  artifactName: 'FlyEnv Setup ${version}.${ext}',
  win: {
    artifactName: 'FlyEnv Setup ${version}.${ext}',
    icon: 'build/icon.ico',
    requestedExecutionLevel: 'requireAdministrator',
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
    allowToChangeInstallationDirectory: true
  },
  portable: {
    artifactName: 'FlyEnv Portable ${version}.${ext}',
    requestExecutionLevel: 'admin'
  },
  publish: []
}

export default conf
