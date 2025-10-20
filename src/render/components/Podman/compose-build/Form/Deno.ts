import { reactive } from 'vue'
import { normalize } from '@/util/path-browserify'
import Base, { currentTimeZone } from '@/components/Podman/compose-build/Form/Base'
import { OfficialImages } from '@/components/Podman/officialImages'

const Deno = reactive({
  enable: false,
  version: 'latest',
  wwwRoot: '',
  ports: [{ in: '3000', out: '3000' }],
  environment: {
    TZ: currentTimeZone,
    DENO_ENV: 'development',
    NPM_CONFIG_CACHE: '/app/.npm',
    DENO_DIR: '/app'
  },
  command: `sh -c "deno install && deno run --allow-net --allow-read --allow-write --allow-env main.ts"`,
  check() {
    return ''
  },
  async build() {
    const base = Base
    const mirror = base.mirrorHost()

    const environment = {
      ...Deno.environment
    }
    const image = OfficialImages.deno!.image
    const node: any = {
      image: `${mirror}${image}:${Deno.version}`,
      ports: Deno.ports.map((p) => `${p.out}:${p.in}`),
      environment,
      networks: ['flyenv-network'],
      working_dir: '/app',
      command: Deno.command
    }

    if (Deno.wwwRoot) {
      const root = Deno.wwwRoot
      node.volumes = [
        {
          type: 'bind',
          source: normalize(root),
          target: '/app',
          read_only: false
        }
      ]
    }

    return {
      node
    }
  }
})

export default Deno
