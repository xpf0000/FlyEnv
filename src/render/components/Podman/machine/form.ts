export const PODMAN_MACHINE_DISK_GIB = {
  min: 10,
  max: 1024,
  unit: 'GiB'
} as const

export type PodmanMachineForm = {
  name: string
  cpus: number
  memory: number
  disk: number
  isDefault: boolean
  rootful: boolean
  rosetta: boolean
  remoteUsername: string
}

export const createPodmanMachineForm = (
  overrides: Partial<PodmanMachineForm> = {}
): PodmanMachineForm => ({
  name: '',
  cpus: 4,
  memory: 4096,
  disk: 20,
  isDefault: false,
  rootful: false,
  rosetta: false,
  remoteUsername: '',
  ...overrides
})
