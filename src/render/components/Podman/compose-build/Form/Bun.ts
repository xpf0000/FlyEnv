import { reactive } from 'vue'
import { normalize } from '@/util/path-browserify'
import Base, { currentTimeZone } from '@/components/Podman/compose-build/Form/Base'
import { OfficialImages } from '@/components/Podman/officialImages'

const Bun = reactive({
  enable: false,
  version: 'latest',
  wwwRoot: '',
  ports: [{ in: '3000', out: '3000' }],
  environment: {
    TZ: currentTimeZone,
    NODE_ENV: 'development',
    NPM_CONFIG_CACHE: '/app/.npm'
  },
  command: `sh -c "bun install && bun run start"`,
  check() {
    return ''
  },
  async build() {
    const base = Base
    const mirror = base.mirrorHost()

    const environment = {
      ...Bun.environment
    }

    const image = OfficialImages.bun!.image

    const node: any = {
      image: `${mirror}${image}:${Bun.version}`,
      ports: Bun.ports.map((p) => `${p.out}:${p.in}`),
      environment,
      networks: ['flyenv-network'],
      working_dir: '/app',
      command: Bun.command
    }

    if (Bun.wwwRoot) {
      const root = Bun.wwwRoot
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

export default Bun
