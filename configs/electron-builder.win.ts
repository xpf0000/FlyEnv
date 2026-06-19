import type { Configuration } from 'electron-builder'
import AfterSign from '../build/afterSign'
import AfterPackSign, { customSign } from '../build/afterPackSign'

const conf: Configuration = {
  productName: 'FlyEnv',
  executableName: 'FlyEnv',
  buildVersion: '4.15.5',
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
    // helper 由 SignPath 在打包前预签(见 .github/workflows + build/signpath),
    // 不再使用 electron-builder 自带签名(CI 无本地证书)。
    // signtoolOptions.sign 自定义钩子:仅用于签 NSIS 阶段才生成的 elevate.exe / 卸载器
    // (它们在 afterSign 之后才出现,批量签名够不着);对其它 PE 该钩子是 no-op。
    signtoolOptions: {
      sign: customSign
    },
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
  // 注意顺序:electron-builder 的 signApp 会对 FlyEnv.exe 跑 rcedit 改写版本号/图标/manifest,
  // 这会抹掉签名。因此签名必须放在 afterSign(rcedit 之后):先移动 helper 到最终位置,
  // 再对整个 win-unpacked 做 SignPath 签名,确保 FlyEnv.exe 等所有 PE 的签名是最后落定的。
  afterSign: async (context) => {
    await AfterSign(context)
    await AfterPackSign(context)
  }
}

export default conf
