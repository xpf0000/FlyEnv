import { join, resolve } from 'path'
import _fs from 'fs-extra'
import { exec } from 'child_process'
import { promisify } from 'util'
import { isLinux } from '../src/shared/utils'

const { mkdirp, writeFile, readFile } = _fs
const execPromise = promisify(exec)

/**
 * Handle the app store node-pty Python library linking issue
 * @param {Object} pack - Pack object containing build information
 * @returns {Promise<boolean>}
 */
export default async function after(pack) {
  if (isLinux()) {
    console.log('linux pack: ', pack)
    /**
     * /home/xpf0000/Desktop/GitHub/FlyEnv/release/linux-unpacked/resources/
     * {
     *   appOutDir: '/home/xpf0000/Desktop/GitHub/FlyEnv/release/linux-unpacked',
     *   outDir: '/home/xpf0000/Desktop/GitHub/FlyEnv/release',
     *   arch: 1,
     *   targets: [
     *     FpmTarget {
     *       name: 'deb',
     *       isAsyncSupported: false,
     *       packager: [LinuxPackager],
     *       helper: [LinuxTargetHelper],
     *       outDir: '/home/xpf0000/Desktop/GitHub/FlyEnv/release',
     *       options: [Object],
     *       scriptFiles: [Promise]
     *     },
     *     FpmTarget {
     *       name: 'rpm',
     *       isAsyncSupported: false,
     *       packager: [LinuxPackager],
     *       helper: [LinuxTargetHelper],
     *       outDir: '/home/xpf0000/Desktop/GitHub/FlyEnv/release',
     *       options: [Object],
     *       scriptFiles: [Promise]
     *     }
     *   ],
     *   packager: LinuxPackager {
     *     info: Packager {
     *       cancellationToken: [CancellationToken],
     *       _metadata: [Object],
     *       _nodeModulesHandledExternally: false,
     *       _isPrepackedAppAsar: false,
     *       _devMetadata: [Object],
     *       _configuration: [Object],
     *       isTwoPackageJsonProjectLayoutUsed: false,
     *       eventEmitter: [AsyncEventEmitter],
     *       _appInfo: [AppInfo],
     *       tempDirManager: [TmpDir],
     *       _repositoryInfo: [Lazy],
     *       debugLogger: [DebugLogger],
     *       nodeDependencyInfo: [Map],
     *       stageDirPathCustomizer: [Function (anonymous)],
     *       _buildResourcesDir: '/home/xpf0000/Desktop/GitHub/FlyEnv/build',
     *       _framework: [ElectronFramework],
     *       toDispose: [Array],
     *       projectDir: '/home/xpf0000/Desktop/GitHub/FlyEnv',
     *       _appDir: '/home/xpf0000/Desktop/GitHub/FlyEnv',
     *       options: [Object]
     *     },
     *     platform: Platform {
     *       name: 'linux',
     *       buildConfigurationKey: 'linux',
     *       nodeName: 'linux'
     *     },
     *     _resourceList: Lazy { _value: null, creator: [Function (anonymous)] },
     *     platformSpecificBuildOptions: {
     *       icon: 'build/Icon@256x256.icns',
     *       asarUnpack: [Array],
     *       category: 'Development',
     *       target: [Array]
     *     },
     *     appInfo: AppInfo {
     *       info: [Packager],
     *       platformSpecificOptions: [Object],
     *       description: 'All-In-One Full-Stack Environment Management Tool',
     *       version: '4.10.3',
     *       type: 'module',
     *       buildNumber: undefined,
     *       buildVersion: '4.10.3',
     *       productName: 'FlyEnv',
     *       sanitizedProductName: 'FlyEnv',
     *       productFilename: 'FlyEnv'
     *     },
     *     executableName: 'FlyEnv'
     *   },
     *   electronPlatformName: 'linux'
     * }
     */
    return
  }
  if (pack.arch === 1) {
    const fromBinDir = resolve(pack.appOutDir, '../../build/bin/x86')
    const toBinDir = join(pack.appOutDir, 'FlyEnv.app/Contents/Resources/helper/')
    await mkdirp(toBinDir)
    const command = `cp ./* "${toBinDir}"`
    console.log('command: ', command)
    await execPromise(command, {
      cwd: fromBinDir
    })
  }
  // arm64
  else if (pack.arch === 3) {
    const fromBinDir = resolve(pack.appOutDir, '../../build/bin/arm')
    const toBinDir = join(pack.appOutDir, 'FlyEnv.app/Contents/Resources/helper/')
    await mkdirp(toBinDir)
    const command = `cp ./* "${toBinDir}"`
    console.log('command: ', command)
    await execPromise(command, {
      cwd: fromBinDir
    })
  }

  let fromBinDir = resolve(pack.appOutDir, '../../build/plist')
  let toBinDir = join(pack.appOutDir, 'FlyEnv.app/Contents/Resources/plist/')
  await mkdirp(toBinDir)
  let command = `cp ./* "${toBinDir}"`
  console.log('command: ', command)
  await execPromise(command, {
    cwd: fromBinDir
  })

  const shFile = join(pack.appOutDir, 'FlyEnv.app/Contents/Resources/helper/flyenv.sh')
  const tmplFile = resolve(pack.appOutDir, '../../static/sh/macOS/fly-env.sh')
  const content = await readFile(tmplFile, 'utf-8')
  await writeFile(shFile, content)

  console.log('afterPack handle end !!!!!!')
  return
}
