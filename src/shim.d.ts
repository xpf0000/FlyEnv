import BaseDialog from '@/components/YbBaseDialog/dialog'
export {}
type CallBackFn = (...args: any) => void
declare module 'vue' {
  interface ComponentCustomProperties {
    callBack?: CallBackFn | null
    $baseDialog(componant: any): BaseDialog
    $confirm: CallBackFn
    $baseLoading(text: string, index?: number): void
    $baseLoadingClose(): void
    $destroy(): void
    onClosed(): void
    $baseConfirm(content: string, title?: string, param?: { [key: string]: any }): Promise<any>
    $basePopBox(componant: any, data?: object): any
    $message: {
      success(msg: string): void
      error(msg: string): void
      warning(msg: string): void
      info(msg: string): void
    }
    _uid: number
    vm?: any
    vmInstance?: any
    xterm?: any
    monacoInstance?: any
    installExtensionDir?: any
    dropNode?: any
  }
}
