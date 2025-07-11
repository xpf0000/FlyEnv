import type { Configuration } from 'electron-builder'
import PublishConfig from './publish'
import AfterPack from '../build/afterPack'
import Notarize from '../build/notarize'
/**
 * one environment
 * envlab
 * Devenvs
 * XDevenvs
 * DevEnvs
 * Onevns
 * DeployLab
 * One Environ
 */
const conf: Configuration = {
  productName: 'FlyEnv',
  executableName: 'FlyEnv',
  buildVersion: '4.10.2',
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
  dmg: {
    sign: false,
    window: {
      width: 540,
      height: 380
    },
    contents: [
      {
        x: 410,
        y: 230,
        type: 'link',
        path: '/Applications'
      },
      {
        x: 130,
        y: 230,
        type: 'file'
      }
    ]
  },
  mac: {
    icon: 'build/Icon.icns',
    target: {
      target: 'default',
      // target: 'pkg',
      arch: ['x64', 'arm64']
      // arch: ['arm64']
    },
    asarUnpack: ['**/*.node'],
    extendInfo: {
      'Icon file': 'icon.icns',
      CFBundleDisplayName: 'FlyEnv',
      CFBundleExecutable: 'PhpWebStudy'
    },
    type: 'distribution',
    darkModeSupport: true,
    category: 'public.app-category.developer-tools',
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    hardenedRuntime: true,
    gatekeeperAssess: false
  },
  afterPack: (...args) => {
    return AfterPack(...args) as any
  },
  afterSign: (...args) => {
    return Notarize(...args)
  },
  publish: [PublishConfig]
}

export default conf
