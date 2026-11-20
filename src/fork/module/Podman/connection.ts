export type PodmanServiceDestination = {
  Name?: string
  URI?: string
  Default?: boolean
  IsMachine?: boolean
}

/**
 * `podman machine list` yields the *machine* name, but every machine-scoped
 * command needs a *connection* (service destination) name, and the two are not
 * the same on a rootful machine:
 *
 *   podman-machine-default        ssh://user@.../run/user/1000/podman/podman.sock  (rootless store)
 *   podman-machine-default-root   ssh://root@.../run/podman/podman.sock           (root store)
 *
 * `podman machine set --rootful` switches the default connection between them,
 * so a bare `podman ps` in a terminal reads the root store while
 * `podman --connection podman-machine-default ps` reads an empty rootless
 * store. Follow the default destination that belongs to this machine first
 * (that is what the CLI does), then fall back to the machine's own rootful
 * flag, then to the only destination registered for it.
 */
export const podmanConnectionName = (
  machineName: string,
  destinations: PodmanServiceDestination[],
  rootful?: boolean
): string => {
  if (!machineName) {
    return machineName
  }
  const rootConnection = `${machineName}-root`
  const own = (destinations ?? []).filter(
    (item) => item?.Name === machineName || item?.Name === rootConnection
  )
  const byDefault = own.find((item) => item?.Default)
  if (byDefault?.Name) {
    return byDefault.Name
  }
  const hasRoot = own.some((item) => item?.Name === rootConnection)
  if (rootful === true && hasRoot) {
    return rootConnection
  }
  const hasRootless = own.some((item) => item?.Name === machineName)
  if (!hasRootless && hasRoot) {
    return rootConnection
  }
  return machineName
}
