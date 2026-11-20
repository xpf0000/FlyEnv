import assert from 'node:assert/strict'

// A URL also lets Node's built-in TS stripping run this dependency-free test.
const { podmanConnectionName }: typeof import('../src/fork/module/Podman/connection') =
  await import(new URL('../src/fork/module/Podman/connection.ts', import.meta.url).href)

// Real `podman system connection ls --format json` (Podman 6.1.2, rootful
// Windows machine): the rootless destination and the root one, the latter
// marked default by `podman machine set --rootful`.
const rootless = {
  Name: 'podman-machine-default',
  URI: 'ssh://user@127.0.0.1:55231/run/user/1000/podman/podman.sock',
  Default: false,
  IsMachine: true
}
const root = {
  Name: 'podman-machine-default-root',
  URI: 'ssh://root@127.0.0.1:55231/run/podman/podman.sock',
  Default: true,
  IsMachine: true
}

// Rootful machine: the CLI reads the root store, so the UI has to as well.
assert.equal(podmanConnectionName('podman-machine-default', [rootless, root]), root.Name)
// Rootless machine: only `<name>` is registered / default.
assert.equal(
  podmanConnectionName('podman-machine-default', [{ ...rootless, Default: true }]),
  rootless.Name
)
// Rootful machine when another machine owns the global default.
const otherDefault = { ...rootless, Name: 'other-machine', Default: true }
const nonDefaultRoot = { ...root, Default: false }
assert.equal(
  podmanConnectionName('podman-machine-default', [otherDefault, rootless, nonDefaultRoot], true),
  root.Name
)
// An explicit default always wins: that is the store `podman ps` reads, and the
// UI has to show the same thing even if the rootful flag says otherwise.
assert.equal(
  podmanConnectionName(
    'podman-machine-default',
    [{ ...rootless, Default: true }, nonDefaultRoot],
    true
  ),
  rootless.Name
)
// No default at all, rootful machine -> root destination.
assert.equal(
  podmanConnectionName('podman-machine-default', [rootless, nonDefaultRoot], true),
  root.Name
)
// No default and rootful flag unknown -> keep the machine name (previous behaviour).
assert.equal(
  podmanConnectionName('podman-machine-default', [
    { ...rootless, Default: false },
    { ...root, Default: false }
  ]),
  rootless.Name
)
// A machine whose rootless destination is missing entirely.
assert.equal(podmanConnectionName('podman-machine-default', [root]), root.Name)
// Unknown machine / empty podman output / empty name: never invent a name.
assert.equal(podmanConnectionName('other-machine', [rootless, root]), 'other-machine')
assert.equal(podmanConnectionName('podman-machine-default', []), 'podman-machine-default')
assert.equal(podmanConnectionName('', [rootless, root]), '')
assert.equal(
  podmanConnectionName('podman-machine-default', undefined as unknown as never[]),
  'podman-machine-default'
)
// The default destination is only trusted when it belongs to this machine.
assert.equal(
  podmanConnectionName('machine-a', [
    { Name: 'machine-b', Default: true },
    { Name: 'machine-a', Default: false }
  ]),
  'machine-a'
)

console.log('Podman connection: default and rootful fallback resolution passed.')
