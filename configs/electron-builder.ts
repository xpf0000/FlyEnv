import type { Configuration } from 'electron-builder'
import PublishConfig from './publish'

const conf: Configuration = {
  productName: 'PhpWebStudy',
  buildVersion: '1.0.16',
  electronVersion: '16.0.7',
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
    '!**/node_modules/.bin'
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
    target: ['dmg', 'zip'],
    extendInfo: {
      'Icon file': 'icon.icns'
    },
    type: 'distribution',
    darkModeSupport: true,
    category: 'public.app-category.developer-tools',
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    hardenedRuntime: true,
    gatekeeperAssess: false
  },
  afterSign: 'build/notarize.js',
  publish: [PublishConfig]
}

export default conf
