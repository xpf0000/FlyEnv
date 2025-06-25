import { MessageError, MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
import IPC from '@/util/IPC'
import { clipboard } from '@/util/NodeFn'

export const Project = {
  copyPath(dir: string) {
    clipboard.writeText(dir)
    MessageSuccess(I18nT('base.copySuccess'))
  },
  openPath(
    dir: string,
    flag:
      | 'PowerShell'
      | 'PowerShell7'
      | 'Terminal'
      | 'VSCode'
      | 'Sublime'
      | 'PhpStorm'
      | 'WebStorm'
      | 'HBuilderX'
      | 'GoLand'
      | 'IntelliJ'
      | 'PyCharm'
      | 'RubyMine'
      | 'RustRover'
  ) {
    IPC.send('app-fork:tools', 'openPathByApp', dir, flag).then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 1) {
        MessageError(res?.msg ?? '')
      }
    })
  }
}
