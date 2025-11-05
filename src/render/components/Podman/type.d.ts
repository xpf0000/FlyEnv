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

export interface ContainerPortItem {
  host_ip: string
  container_port: number
  host_port: number
  range: number
  protocol: string
}

export interface ContainerItem {
  AutoRemove: boolean
  Command: string[]
  CreatedAt: string
  CIDFile: string
  Exited: boolean
  ExitedAt: number
  ExitCode: number
  ExposedPorts: Record<string, string[]>
  Id: string
  Image: string
  ImageID: string
  IsInfra: boolean
  Mounts: string[]
  Names: string[]
  Networks: string[]
  Pid: number
  Pod: string
  PodName: string
  Ports: ContainerPortItem[]
  Restarts: number
  Size: number
  StartedAt: number
  State: string
  Status: string
  Created: number
}
