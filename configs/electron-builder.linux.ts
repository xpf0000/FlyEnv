import type { Configuration } from 'electron-builder'
import AfterPack from '../build/afterPack'

// electron-builder 的 ${arch} 宏对 deb/rpm 会转成各包格式的原生架构名
// (deb: x64→amd64, rpm: x64→x86_64 / arm64→aarch64)，无法得到统一的 x64/arm64。
// 每个 CI job 都是单一架构的 runner，直接用 process.arch 拼文件名即可。
// 注意：这只影响产物文件名，包内部架构标识由 fpm --architecture 单独处理，不受影响。
const archName = process.arch === 'arm64' ? 'arm64' : 'x64'

// node-pty 自带全部平台的 prebuilds;linux 构建只需当前架构对应的 linux-* 一个,
// 其余平台(含 Windows 专用的 third_party/conpty)全部裁掉以减小体积。
const ptyKeep = `linux-${archName}`
const ptyPrebuildExcludes = ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'win32-arm64', 'win32-x64']
  .filter((d) => d !== ptyKeep)
  .map((d) => `!**/node_modules/node-pty/prebuilds/${d}/**`)

const desktop: any = {
  Name: 'FlyEnv',
  Comment: 'All-In-One Full-Stack Environment Management Tool',
  // Exec: 'FlyEnv', // 确保这里与 executableName 一致
  // Icon: 'com.xpf0000.flyenv', // 通常是 executableName 的小写，或者你的应用ID
  Terminal: false,
  StartupNotify: true,
  Type: 'Application',
  Categories: 'Development;Utility;'
}

const conf: Configuration = {
  productName: 'FlyEnv',
  executableName: 'FlyEnv',
  buildVersion: '4.15.5',
  electronVersion: '39.8.7',
  appId: 'com.xpf0000.flyenv',
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
    '!**/node_modules/nodejieba/dict',
    ...ptyPrebuildExcludes,
    // third_party/conpty is Windows-only, not needed on Linux
    '!**/node_modules/node-pty/third_party/**'
  ],
  deb: {
    packageName: 'flyenv'
  },
  rpm: {
    packageName: 'flyenv'
  },
  artifactName: `\${productName}-\${version}-${archName}.\${ext}`, // 自定义打包文件名格式
  linux: {
    icon: 'build/icons',
    asarUnpack: ['**/*.node', '**/node_modules/sharp/**/*', '**/node_modules/@img/**/*'],
    category: 'Development',
    packageCategory: 'Development',
    desktop: {
      entry: desktop
    },
    target: [
      {
        target: 'deb'
      },
      {
        target: 'rpm'
      }
    ]
  },
  afterPack: (...args) => {
    return AfterPack(...args) as any
  }
}

export default conf
