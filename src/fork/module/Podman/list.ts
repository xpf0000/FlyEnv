export type PodmanContainerPort = {
  in: number
  out: number
}

export type PodmanContainerItem = {
  id: string
  name: string[]
  Image: string
  ImageID: string
  Mounts: any[]
  Networks: any[]
  command: string[]
  run: boolean
  running: boolean
  machineName: string
  Ports: PodmanContainerPort[]
}

export type PodmanImageItem = {
  id: string
  name: string[]
  tag: string
  size: number
  created: string
}

/**
 * `podman ps -a --format json` reports `"Ports": null` for containers that
 * publish no port (created without `-p`, or only `expose`d). Calling `.map()`
 * on it throws, and because containers and images are fetched inside the same
 * `fetchMachineInfo` call, a single port-less container empties the whole
 * Podman page (containers *and* images). Treat it as an empty list.
 */
export const podmanContainerItem = (c: any, machineName: string): PodmanContainerItem => ({
  id: c.Id,
  name: c.Names,
  Image: c.Image,
  ImageID: c.ImageID,
  Mounts: c.Mounts,
  Networks: c.Networks,
  command: c.Command ?? [],
  run: c.State === 'running',
  running: false,
  machineName,
  Ports: (c.Ports ?? []).map((p: any) => ({
    in: p.container_port,
    out: p.host_port
  }))
})

export const podmanImageItem = (img: any): PodmanImageItem => ({
  id: img.Id,
  name: img.Names,
  tag: img.Tag,
  size: Number(img.Size),
  created: img.CreatedAt
})
