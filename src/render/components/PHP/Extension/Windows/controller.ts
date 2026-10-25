import IPC from '@/util/IPC'
import { reactiveBind } from '@/util/Index'
import { MessageError, MessageSuccess, MessageWarning } from '@/util/Element'
import { I18nT } from '@lang/index'
import { PHPSetup } from '@/components/PHP/store'
import { LoadedSetup } from '../Loaded/setup'
import { WindowsExtensionController } from './Operation'
import { extensionRequest } from '../Request'

export default reactiveBind(
  new WindowsExtensionController({
    request: <T>(method: string, args: unknown[], progress?: (text: string) => void) =>
      extensionRequest<T>(IPC, method, args, progress),
    notice: (kind, text) => {
      if (kind === 'error') MessageError(text)
      else if (kind === 'warning') MessageWarning(text)
      else MessageSuccess(text)
    },
    refresh: (version) => {
      LoadedSetup.reFetch(version)
      delete PHPSetup.localExtend[version.bin]
      delete PHPSetup.localUsed[version.bin]
    },
    successMessage: () => `${I18nT('php.windowsInstallSuccess')} ${I18nT('php.windowsRestart')}`,
    disabledMessage: () => I18nT('php.windowsDisableSuccess')
  })
)
