import type { Configuration } from 'electron-builder'
import AfterPack from '../build/afterPack'

const conf: Configuration = {
  productName: 'FlyEnv',
  executableName: 'FlyEnv',
  buildVersion: '4.10.3',
  electronVersion: '35.6.0',
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
    '!**/node_modules/nodejieba/dict'
  ],
  linux: {
    icon: 'build/Icon@256x256.icns',
    asarUnpack: ['**/*.node'],
    category: 'Development',
    target: [
      {
        target: 'deb',
        arch: ['x64', 'arm64']
      },
      {
        target: 'rpm',
        arch: ['x64', 'arm64']
      }
    ]
  },
  afterPack: (...args) => {
    return AfterPack(...args) as any
  }
}

export default conf
