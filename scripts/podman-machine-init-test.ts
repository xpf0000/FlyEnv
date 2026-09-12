import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc'

const formModule = await import('../src/render/components/Podman/machine/form').catch(
  () => undefined
)
assert.ok(formModule, 'Podman machine form must expose its creation defaults as testable behavior')

const machineInitModule = await import('../src/fork/module/Podman/machineInit').catch(
  () => undefined
)
assert.ok(machineInitModule, 'Podman machine init must expose its CLI argument builder')

const form = formModule.createPodmanMachineForm()
assert.equal(form.disk, 20)
assert.equal('identityPath' in form, false)
assert.deepEqual(formModule.PODMAN_MACHINE_DISK_GIB, {
  min: 10,
  max: 1024,
  unit: 'GiB'
})

const args = machineInitModule.podmanMachineInitArgs({
  ...form,
  name: 'podman-machine-default'
})
assert.deepEqual(args, [
  'podman machine init',
  '--cpus 4',
  '--memory 4096',
  '--disk-size 20',
  '--rootful=false',
  'podman-machine-default'
])
assert.equal(
  args.some((arg) => arg.startsWith('--identity-path')),
  false
)

const machineAddSource = readFileSync(
  new URL('../src/render/components/Podman/machine/machineAdd.vue', import.meta.url),
  'utf8'
)
const podmanForkSource = readFileSync(
  new URL('../src/fork/module/Podman/index.ts', import.meta.url),
  'utf8'
)
const dashboardSource = readFileSync(
  new URL('../src/render/components/Podman/dashboard.vue', import.meta.url),
  'utf8'
)
assert.match(machineAddSource, /createPodmanMachineForm\(props\?\.item\)/)
assert.match(machineAddSource, /PODMAN_MACHINE_DISK_GIB\.min/)
assert.match(machineAddSource, /PODMAN_MACHINE_DISK_GIB\.max/)
assert.doesNotMatch(machineAddSource, /v-model="form\.identityPath"/)
assert.match(podmanForkSource, /podmanMachineInitArgs\(config\)/)
assert.doesNotMatch(podmanForkSource, /--identity-path/)
assert.match(dashboardSource, /info\.Resources\?\.DiskSize }} GiB/)

for (const [filename, source] of [
  ['src/render/components/Podman/machine/machineAdd.vue', machineAddSource],
  ['src/render/components/Podman/dashboard.vue', dashboardSource]
] as const) {
  const component = parse(source, { filename })
  assert.deepEqual(component.errors, [])
  assert.ok(component.descriptor.scriptSetup)
  assert.ok(component.descriptor.template)
  const script = compileScript(component.descriptor, { id: filename })
  const template = compileTemplate({
    id: filename,
    filename,
    source: component.descriptor.template.content,
    compilerOptions: { bindingMetadata: script.bindings }
  })
  assert.deepEqual(template.errors, [])
}

console.log('Podman machine init regression tests passed')
