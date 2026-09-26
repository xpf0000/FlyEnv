export type TrayAction = 'groupDo' | 'startupGroupDo' | 'switchChange' | 'show' | 'exit'

/** 托盘弹窗相对托盘图标所在的边,同时决定箭头贴在弹窗的哪条边 */
export type TrayPopupSide = 'up' | 'down' | 'left' | 'right'

export type TrayModuleItemState = {
  show: boolean
  run: boolean
  running: boolean
  disabled: boolean
}

export type TrayServiceItem = {
  id: string
  label: string
  icon: string
  iconPadding?: number
  typeFlag: string
} & TrayModuleItemState

export type TrayStartupGroupItem = {
  id: string
  name: string
  color?: string
  run: boolean
  running: boolean
  disabled: boolean
}

export interface TrayState {
  password: string
  lang: string
  theme: string
  groupIsRunning: boolean
  groupDisabled: boolean
  startupGroups: TrayStartupGroupItem[]
  service: TrayServiceItem[]
  isMacOS?: boolean
  isLinux?: boolean
  isWindows?: boolean
}
