import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// A URL also lets Node's built-in TS stripping run this dependency-free test.
const { podmanContainerItem, podmanImageItem }: typeof import('../src/fork/module/Podman/list') =
  await import(new URL('../src/fork/module/Podman/list.ts', import.meta.url).href)

const source = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

// Real `podman ps -a --format json` (Podman 6.1.2, Windows WSL machine) entries.
const runningWithPorts = {
  Command: ['mysqld'],
  CreatedAt: '3 weeks ago',
  Exited: false,
  Id: '68f4e4a1feb584b3f4d8c3ff7b2a1ef30e8b7e2b8fdd6d2c4a8cbfb7d95e9b1a',
  Image: 'docker.io/library/mysql:8.0',
  ImageID: '6cd09145362dfe6831b14545de3d5fd6cc75c37cfd6ef8561429c1fc73518b39',
  Mounts: [],
  Names: ['micro-data-share-test-mysql'],
  Networks: ['podman'],
  Ports: [
    { container_port: 3306, host_ip: '', host_port: 13306, protocol: 'tcp', range: 1 },
    { container_port: 33060, host_ip: '127.0.0.1', host_port: 13360, protocol: 'tcp', range: 1 }
  ],
  State: 'running'
}

// Containers created without `-p` (or with only `expose`) report `Ports: null`.
const runningWithoutPorts = {
  Command: ['-server', 'http://platform:8080'],
  CreatedAt: '13 minutes ago',
  Id: '91419a46d0930e3db63ff2de3d3c13f8b0e1a4d4d0c1b2a3f4e5d6c7b8a90f1e',
  Image: 'ghcr.io/tencent/loopforge:0.3.8',
  ImageID: 'ba3d62a626c47a68cf2726630bb717b7d6b573a99c0768e2214ea329a75148cd',
  Mounts: [],
  Names: ['loopforge-runner-1'],
  Networks: ['loopforge_default'],
  Ports: null,
  State: 'running'
}

const createdWithoutPorts = {
  Command: ['sh', '-c', 'echo'],
  Id: '24df15f132e6a0d1e2f3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809',
  Image: 'docker.io/library/alpine:3.20',
  ImageID: 'beefdbd8a1da6d2915566fde36db9db0b524eb737fc57cd1367effd16dc0d06d',
  Names: ['festive_ptolemy'],
  Ports: null,
  State: 'created'
}

const withPorts = podmanContainerItem(runningWithPorts, 'podman-machine-default')
assert.deepEqual(withPorts.Ports, [
  { in: 3306, out: 13306 },
  { in: 33060, out: 13360 }
])
assert.equal(withPorts.id, runningWithPorts.Id)
assert.deepEqual(withPorts.name, ['micro-data-share-test-mysql'])
assert.equal(withPorts.Image, 'docker.io/library/mysql:8.0')
assert.equal(withPorts.ImageID, runningWithPorts.ImageID)
assert.equal(withPorts.command, runningWithPorts.Command)
assert.equal(withPorts.run, true)
assert.equal(withPorts.running, false)
assert.equal(withPorts.machineName, 'podman-machine-default')

// The regression: `.map()` on a null Ports list used to throw and blank the page.
const withoutPorts = podmanContainerItem(runningWithoutPorts, 'podman-machine-default')
assert.deepEqual(withoutPorts.Ports, [])
assert.equal(withoutPorts.run, true)
assert.equal(withoutPorts.name[0], 'loopforge-runner-1')

const created = podmanContainerItem(createdWithoutPorts, 'podman-machine-default')
assert.deepEqual(created.Ports, [])
assert.equal(created.run, false)

// Missing key (older `podman ps` builds) must behave like null.
assert.deepEqual(podmanContainerItem({ Id: 'x', Names: ['x'], State: 'exited' }, 'm').Ports, [])

assert.deepEqual(
  podmanImageItem({
    Id: 'ba3d62a626c47a68cf2726630bb717b7d6b573a99c0768e2214ea329a75148cd',
    Names: ['ghcr.io/tencent/loopforge:0.3.8'],
    Tag: '0.3.8',
    Size: 2163185717,
    CreatedAt: '2026-11-12T13:02:39Z'
  }),
  {
    id: 'ba3d62a626c47a68cf2726630bb717b7d6b573a99c0768e2214ea329a75148cd',
    name: ['ghcr.io/tencent/loopforge:0.3.8'],
    tag: '0.3.8',
    size: 2163185717,
    created: '2026-11-12T13:02:39Z'
  }
)
assert.equal(podmanImageItem({ Id: 'x', Names: [], Tag: '', Size: '1024' }).size, 1024)

// Keep the fix in the fork module: both lists go through the parsers, and the
// unguarded `.map()` on the raw Ports field cannot come back.
const forkSource = source('src/fork/module/Podman/index.ts')
assert.match(forkSource, /json\.map\(\(c: any\) => podmanContainerItem\(c, machineName\)\)/)
assert.match(forkSource, /json\.map\(\(img: any\) => podmanImageItem\(img\)\)/)
assert.doesNotMatch(forkSource, /c\.Ports\.map\(/)

console.log(
  'Podman list: container/image parsing tolerates `Ports: null` (containers without published ports).'
)
