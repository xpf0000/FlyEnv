import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  createBaseDirectories,
  createDeferredHelperInstallRequest
} from '../src/main/utils/ServerDirectory'

const denied = (code: 'EACCES' | 'EPERM') => {
  const error = new Error(`mkdir denied: ${code}`) as NodeJS.ErrnoException
  error.code = code
  return error
}

async function main() {
  let helperInstallRequests = 0
  const attemptedDirectories: string[] = []

  const deniedDirectoryResult = await createBaseDirectories(
    ['C:/Program Files/FlyEnv-Data/server', 'C:/Program Files/FlyEnv-Data/app'],
    {
      createDirectory: async (directory) => {
        attemptedDirectories.push(directory)
        throw denied('EPERM')
      },
      isWindows: () => true,
      onPermissionDenied: () => {
        helperInstallRequests += 1
      }
    }
  )

  assert.deepEqual(
    attemptedDirectories,
    ['C:/Program Files/FlyEnv-Data/server'],
    'a denied data root must stop subsequent module directory creation'
  )
  assert.equal(
    deniedDirectoryResult,
    false,
    'a denied data root must keep renderer module startup blocked until Helper makes it writable'
  )
  assert.equal(helperInstallRequests, 1, 'a denied directory must request Helper once')

  let recoveryCalls = 0
  let recoveryCreateAttempts = 0
  let recoveryInstallRequests = 0
  const recoveredDirectoryResult = await createBaseDirectories(
    ['C:/Program Files/FlyEnv-Data/server', 'C:/Program Files/FlyEnv-Data/app'],
    {
      createDirectory: async () => {
        recoveryCreateAttempts += 1
        if (recoveryCreateAttempts === 1) {
          throw denied('EPERM')
        }
      },
      isWindows: () => true,
      recoverPermissionDenied: async () => {
        recoveryCalls += 1
        return 'recovered'
      },
      onPermissionDenied: () => {
        recoveryInstallRequests += 1
      }
    }
  )
  assert.equal(
    recoveredDirectoryResult,
    true,
    'a running Helper must silently recover a deleted protected data root'
  )
  assert.equal(recoveryCalls, 1, 'the privileged data-root recovery must run only once')
  assert.equal(
    recoveryCreateAttempts,
    3,
    'the denied directory must be retried after recovery before subsequent directories are created'
  )
  assert.equal(
    recoveryInstallRequests,
    0,
    'a successful Helper recovery must not open the Helper-install dialog'
  )

  let commandFailureCreateAttempts = 0
  let commandFailureInstallRequests = 0
  const commandFailureReasons: string[] = []
  const commandFailureResult = await createBaseDirectories(
    ['C:/Program Files/FlyEnv-Data/server'],
    {
      createDirectory: async () => {
        commandFailureCreateAttempts += 1
        throw denied('EPERM')
      },
      isWindows: () => true,
      recoverPermissionDenied: async () => 'failed',
      onPermissionDenied: (reason) => {
        if (reason === 'helper-unavailable') {
          commandFailureInstallRequests += 1
          return
        }
        commandFailureReasons.push(reason)
      }
    }
  )
  assert.equal(
    commandFailureResult,
    false,
    'a Helper command failure must keep the protected data directory unavailable'
  )
  assert.equal(
    commandFailureCreateAttempts,
    1,
    'a failed Helper command must not retry the same ordinary-permission mkdir'
  )
  assert.equal(
    commandFailureInstallRequests,
    0,
    'a usable Helper whose recovery command fails must not be presented as an installation problem'
  )
  assert.deepEqual(
    commandFailureReasons,
    ['failed'],
    'the directory layer must preserve a Helper command failure for direct error reporting'
  )

  let retryFailureInstallRequests = 0
  const retryFailureReasons: string[] = []
  const retryFailureResult = await createBaseDirectories(['C:/Program Files/FlyEnv-Data/server'], {
    createDirectory: async () => {
      throw denied('EPERM')
    },
    isWindows: () => true,
    recoverPermissionDenied: async () => 'recovered',
    onPermissionDenied: (reason) => {
      if (reason === 'helper-unavailable') {
        retryFailureInstallRequests += 1
        return
      }
      retryFailureReasons.push(reason)
    }
  })
  assert.equal(
    retryFailureResult,
    false,
    'a retry that remains denied must return the normal blocked result instead of escaping an exception'
  )
  assert.equal(
    retryFailureInstallRequests,
    0,
    'a Helper recovery followed by another access denial must not be misreported as an installation problem'
  )
  assert.deepEqual(
    retryFailureReasons,
    ['failed'],
    'a failed retry after recovery must remain a direct data-directory error'
  )

  await createBaseDirectories(['C:/Program Files/FlyEnv-Data/server'], {
    createDirectory: async () => {
      throw denied('EACCES')
    },
    isWindows: () => false,
    onPermissionDenied: () => {
      helperInstallRequests += 1
    }
  })
  assert.equal(
    helperInstallRequests,
    1,
    'non-Windows permission failures must not prompt for Helper'
  )

  await createBaseDirectories(['C:/Program Files/FlyEnv-Data/server'], {
    createDirectory: async () => {
      throw new Error('disk unavailable')
    },
    isWindows: () => true,
    onPermissionDenied: () => {
      helperInstallRequests += 1
    }
  })
  assert.equal(helperInstallRequests, 1, 'unrelated directory failures must not prompt for Helper')

  let deferredRequests = 0
  const deferredInstall = createDeferredHelperInstallRequest(() => {
    deferredRequests += 1
  })
  deferredInstall.notifyPermissionDenied()
  deferredInstall.notifyPermissionDenied()
  assert.equal(
    deferredRequests,
    0,
    'the renderer cannot receive a prompt before its window is ready'
  )

  deferredInstall.markReady()
  assert.equal(deferredRequests, 1, 'the deferred prompt must run once when the window is ready')

  deferredInstall.notifyPermissionDenied()
  assert.equal(deferredRequests, 1, 'retries after the prompt must not open duplicate installers')

  deferredInstall.resetRequest()
  deferredInstall.notifyPermissionDenied()
  assert.equal(
    deferredRequests,
    2,
    'an explicit data-directory retry after cancelling the installer must request Helper again'
  )

  let directFailureInstallRequests = 0
  const directFailureReasons: string[] = []
  const deferredFailure = createDeferredHelperInstallRequest(
    () => {
      directFailureInstallRequests += 1
    },
    (reason) => {
      directFailureReasons.push(reason)
    }
  )
  deferredFailure.notifyPermissionDenied('failed')
  assert.equal(
    directFailureInstallRequests,
    0,
    'a Helper command failure must not schedule an installer before the renderer is ready'
  )
  assert.deepEqual(directFailureReasons, [], 'the direct failure must wait for the renderer')
  deferredFailure.markReady()
  assert.equal(
    directFailureInstallRequests,
    0,
    'a Helper command failure must never turn into an installer request'
  )
  assert.deepEqual(
    directFailureReasons,
    ['failed'],
    'a Helper command failure must be reported as a direct data-directory error'
  )

  const root = process.cwd()
  const serverPathSource = readFileSync(join(root, 'src/main/utils/ServerPath.ts'), 'utf8')
  const applicationSource = readFileSync(join(root, 'src/main/Application.ts'), 'utf8')
  const rendererMainSource = readFileSync(join(root, 'src/render/main.ts'), 'utf8')
  const globalIpcSource = readFileSync(join(root, 'src/render/util/GlobalIPCOn.ts'), 'utf8')
  const appSource = readFileSync(join(root, 'src/render/App.vue'), 'utf8')
  const globalTypes = readFileSync(join(root, 'src/global.d.ts'), 'utf8')
  const moduleSource = readFileSync(join(root, 'src/render/core/Module/Module.ts'), 'utf8')
  const projectSource = readFileSync(
    join(root, 'src/render/components/LanguageProjects/Project.ts'),
    'utf8'
  )
  assert.match(serverPathSource, /createBaseDirectories\(dirs, \{/)
  assert.match(
    serverPathSource,
    /Helper\.send<boolean>\('tools', 'ensureFlyEnvDataDirectory', dataDirectory\)/,
    'the protected data root must be repaired silently by the running Helper'
  )
  assert.match(
    serverPathSource,
    /recoverPermissionDenied: \(\) => recoverFlyEnvDataDirectory\(dataDirectory\)/,
    'only a Windows permission failure may invoke the data-root recovery hook'
  )
  assert.match(
    serverPathSource,
    /return MakeServerDir\(runpath\)/,
    'the exact configured data root must be passed through rather than inferred from a child path'
  )
  assert.match(
    serverPathSource,
    /onPermissionDenied: \(reason\) => onServerDirectoryPermissionDenied\?\.\(reason\)/,
    'ServerPath must preserve direct Helper recovery failures instead of defaulting them to unavailable'
  )
  assert.match(applicationSource, /setServerDirectoryPermissionDeniedHandler\(/)
  assert.match(
    applicationSource,
    /this\.ipcHandler\.on\('application:renderer-initialized', \(\) => \{\s*this\.serverDirectoryHelperInstall\.markReady\(\)/
  )
  assert.doesNotMatch(
    applicationSource,
    /win\.once\('ready-to-show', \(\) => \{[\s\S]*?serverDirectoryHelperInstall\.markReady\(\)/
  )
  assert.match(
    rendererMainSource,
    /const bootstrap = await RendererLanguage\.initialize\(\)[\s\S]*?appRoot\.mount\('#app'\)[\s\S]*?IPC\.send\('application:renderer-initialized'\)/
  )
  assert.doesNotMatch(
    rendererMainSource,
    /synchronizeHostsAtStartup\(/,
    'Host initialization must wait for the data-directory startup gate in App.vue'
  )
  assert.match(
    appSource,
    /if \(!window\.Server\.DataDirectoryReady\) \{\s*return\s*\}/,
    'module startup must be blocked while the Program Files data directory is not writable'
  )
  assert.match(
    appSource,
    /IPC\.on\('APP-Data-Directory-Ready'\)/,
    'the mounted renderer must resume its deferred startup after the Helper creates the directory'
  )
  assert.match(
    applicationSource,
    /'APP-Data-Directory-Ready'/,
    'the main process must notify the renderer only after it has recreated the data directories'
  )
  assert.match(
    globalTypes,
    /DataDirectoryReady\?: boolean/,
    'the cross-process data-directory readiness flag must be part of the global server contract'
  )
  assert.match(
    moduleSource,
    /ensureDataDirectoryReady\(\)\.then\(\(ready\) => \{\s*return ready \? this\.fetchInstalled\(retryDataDirectory\) : false\s*\}\)/,
    'service discovery must retry the protected data directory and stop cleanly when the user cancels'
  )
  assert.match(
    moduleSource,
    /if \(!retryDataDirectory\) \{\s*return Promise\.resolve\(false\)\s*\}/,
    'only an explicit installed-version refresh may retry a blocked data directory'
  )
  assert.match(
    applicationSource,
    /serverDirectoryHelperInstall\.resetRequest\(\)/,
    'the main process must re-arm the Helper request before rechecking the data directory'
  )
  assert.match(
    readFileSync(join(root, 'src/main/core/IPCHandler.ts'), 'utf8'),
    /case 'application:data-directory-retry'/,
    'the main process must expose an explicit data-directory retry request'
  )
  assert.match(
    projectSource,
    /if \(!\(await ensureDataDirectoryReady\(\)\)\) \{\s*return false\s*\}/,
    'language-project initialization must stop before writing shell state when the user cancels'
  )
  assert.match(
    appSource,
    /const existingModule = brewStore\.modules\[item\.typeFlag\]/,
    'the root startup must reuse modules created by deferred startup-group discovery'
  )
  assert.doesNotMatch(globalIpcSource, /else if \(res\.code === 1\) \{\s*MessageError/)
  assert.match(
    globalIpcSource,
    /res\?\.status === 'installFaild'[\s\S]*?MessageError\(res\?\.msg\)/
  )
  assert.match(globalIpcSource, /HelperStore\.showNeedInstallDialog\(res\?\.reason\)/)
  assert.match(
    globalIpcSource,
    /IPC\.on\('APP-Data-Directory-Failure'\)[\s\S]*?MessageError/,
    'direct data-directory recovery failures must be rendered as errors rather than installer prompts'
  )
  assert.match(
    globalIpcSource,
    /import \{ I18nT \} from '@lang\/index'/,
    'the data-directory failure handler must import its translator instead of failing silently'
  )

  console.log('server path helper install test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
