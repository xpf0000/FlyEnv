export type TrayAction =
  | 'groupDo'
  | 'startupGroupDo'
  | 'switchChange'
  | 'show'
  | 'exit'

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
