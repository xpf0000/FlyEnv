export type PodmanMachineInitConfig = {
  name: string
  cpus: number
  memory: number
  disk: number
  isDefault: boolean
  rootful: boolean
  rosetta: boolean
  remoteUsername?: string
}

export const podmanMachineInitArgs = (config: PodmanMachineInitConfig): string[] => {
  const args = [
    'podman machine init',
    `--cpus ${config.cpus}`,
    `--memory ${config.memory}`,
    `--disk-size ${config.disk}`
  ]

  if (config.isDefault) {
    args.push('--now')
  }
  args.push(config.rootful ? '--rootful' : '--rootful=false')
  if (config.remoteUsername) {
    args.push(`--username "${config.remoteUsername}"`)
  }
  args.push(config.name)

  return args
}
