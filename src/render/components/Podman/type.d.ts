import XTerm from '@/util/XTerm'

export interface MachineItemType {
  ConfigDir: ConfigDir
  ConnectionInfo: ConnectionInfo
  Created: string
  LastUp: string
  Name: string
  Resources: Resources
  SSHConfig: SSHConfig
  State: string
  UserModeNetworking: boolean
  Rootful: boolean
  Rosetta: boolean
}

interface SSHConfig {
  IdentityPath: string
  Port: number
  RemoteUsername: string
}
interface Resources {
  CPUs: number
  DiskSize: number
  Memory: number
  USBs: any[]
}
interface ConnectionInfo {
  PodmanSocket: ConfigDir
  PodmanPipe: null
}
interface ConfigDir {
  Path: string
}

export interface ContainerPortItem {
  in: number
  out: number
}

export interface XTermType {
  installEnd: boolean
  installing: boolean
  xterm?: XTerm
}
