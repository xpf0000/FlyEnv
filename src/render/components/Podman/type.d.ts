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

// 容器状态接口
export interface ContainerState {
  OciVersion: string
  Status: string
  Running: boolean
  Paused: boolean
  Restarting: boolean
  OOMKilled: boolean
  Dead: boolean
  Pid: number
  ExitCode: number
  Error: string
  StartedAt: string
  FinishedAt: string
  CheckpointedAt: string
  RestoredAt: string
}

// 图形驱动数据接口
export interface GraphDriverData {
  LowerDir: string
  UpperDir: string
  WorkDir: string
}

// 图形驱动接口
export interface GraphDriver {
  Name: string
  Data: GraphDriverData
}

// 挂载点接口
export interface ContainerMount {
  Type: string
  Source: string
  Destination: string
  Driver: string
  Mode: string
  Options: string[]
  RW: boolean
  Propagation: string
}

// 端口绑定接口
export interface PortBinding {
  HostIp: string
  HostPort: string
}

// 网络端口接口
export interface NetworkPorts {
  [key: string]: PortBinding[]
}

// 网络配置接口
export interface NetworkConfig {
  EndpointID: string
  Gateway: string
  IPAddress: string
  IPPrefixLen: number
  IPv6Gateway: string
  GlobalIPv6Address: string
  GlobalIPv6PrefixLen: number
  MacAddress: string
  NetworkID: string
  DriverOpts: any
  IPAMConfig: any
  Links: any
  Aliases: string[]
}

// 网络设置接口
export interface NetworkSettings {
  EndpointID: string
  Gateway: string
  IPAddress: string
  IPPrefixLen: number
  IPv6Gateway: string
  GlobalIPv6Address: string
  GlobalIPv6PrefixLen: number
  MacAddress: string
  Bridge: string
  SandboxID: string
  HairpinMode: boolean
  LinkLocalIPv6Address: string
  LinkLocalIPv6PrefixLen: number
  Ports: NetworkPorts
  SandboxKey: string
  Networks: {
    [key: string]: NetworkConfig
  }
}

// 容器配置接口
export interface ContainerConfig {
  Hostname: string
  Domainname: string
  User: string
  AttachStdin: boolean
  AttachStdout: boolean
  AttachStderr: boolean
  Tty: boolean
  OpenStdin: boolean
  StdinOnce: boolean
  Env: string[]
  Cmd: string[]
  Image: string
  Volumes: any
  WorkingDir: string
  Entrypoint: string[]
  OnBuild: any
  Labels: {
    [key: string]: string
  }
  Annotations: {
    [key: string]: string
  }
  StopSignal: string
  HealthcheckOnFailureAction: string
  HealthLogDestination: string
  HealthcheckMaxLogCount: number
  HealthcheckMaxLogSize: number
  Umask: string
  Timeout: number
  StopTimeout: number
  Passwd: boolean
  ExposedPorts: {
    [key: string]: any
  }
}

// 日志配置接口
export interface LogConfig {
  Type: string
  Config: any
  Path: string
  Tag: string
  Size: string
}

// 重启策略接口
export interface RestartPolicy {
  Name: string
  MaximumRetryCount: number
}

// Ulimit接口
export interface Ulimit {
  Name: string
  Soft: number
  Hard: number
}

// 主机配置接口
export interface HostConfig {
  Binds: string[]
  CgroupManager: string
  CgroupMode: string
  ContainerIDFile: string
  LogConfig: LogConfig
  NetworkMode: string
  PortBindings: NetworkPorts
  RestartPolicy: RestartPolicy
  AutoRemove: boolean
  AutoRemoveImage: boolean
  Annotations: {
    [key: string]: string
  }
  VolumeDriver: string
  VolumesFrom: any
  CapAdd: string[]
  CapDrop: string[]
  Dns: string[]
  DnsOptions: string[]
  DnsSearch: string[]
  ExtraHosts: string[]
  HostsFile: string
  GroupAdd: string[]
  IpcMode: string
  Cgroup: string
  Cgroups: string
  Links: any
  OomScoreAdj: number
  PidMode: string
  Privileged: boolean
  PublishAllPorts: boolean
  ReadonlyRootfs: boolean
  SecurityOpt: string[]
  Tmpfs: {
    [key: string]: string
  }
  UTSMode: string
  UsernsMode: string
  ShmSize: number
  Runtime: string
  ConsoleSize: number[]
  Isolation: string
  CpuShares: number
  Memory: number
  NanoCpus: number
  CgroupParent: string
  BlkioWeight: number
  BlkioWeightDevice: any
  BlkioDeviceReadBps: any
  BlkioDeviceWriteBps: any
  BlkioDeviceReadIOps: any
  BlkioDeviceWriteIOps: any
  CpuPeriod: number
  CpuQuota: number
  CpuRealtimePeriod: number
  CpuRealtimeRuntime: number
  CpusetCpus: string
  CpusetMems: string
  Devices: any[]
  DiskQuota: number
  KernelMemory: number
  MemoryReservation: number
  MemorySwap: number
  MemorySwappiness: number
  OomKillDisable: boolean
  PidsLimit: number
  Ulimits: Ulimit[]
  CpuCount: number
  CpuPercent: number
  IOMaximumIOps: number
  IOMaximumBandwidth: number
  CgroupConf: any
}

// 主容器详情接口
export interface ContainerDetail {
  Id: string
  Created: string
  Path: string
  Args: string[]
  State: ContainerState
  Image: string
  ImageDigest: string
  ImageName: string
  Rootfs: string
  Pod: string
  ResolvConfPath: string
  HostnamePath: string
  HostsPath: string
  StaticDir: string
  OCIConfigPath: string
  OCIRuntime: string
  ConmonPidFile: string
  PidFile: string
  Name: string
  RestartCount: number
  Driver: string
  MountLabel: string
  ProcessLabel: string
  AppArmorProfile: string
  EffectiveCaps: string[]
  BoundingCaps: string[]
  ExecIDs: string[]
  GraphDriver: GraphDriver
  Mounts: ContainerMount[]
  Dependencies: string[]
  NetworkSettings: NetworkSettings
  Namespace: string
  IsInfra: boolean
  IsService: boolean
  KubeExitCodePropagation: string
  lockNumber: number
  Config: ContainerConfig
  HostConfig: HostConfig
  UseImageHosts: boolean
  UseImageHostname: boolean
}
