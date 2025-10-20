import { reactive } from 'vue'
import { normalize } from '@/util/path-browserify'
import Base, { currentTimeZone } from '@/components/Podman/compose-build/Form/Base'

const NodeJS = reactive({
  enable: false,
  version: 'latest',
  wwwRoot: '',
  ports: [{ in: '3000', out: '3000' }],
  environment: {
    TZ: currentTimeZone,
    NODE_ENV: 'development',
    NPM_CONFIG_CACHE: '/app/.npm'
  },
  command: `sh -c "npm install && npm start"`,
  check() {
    return ''
  },
  async build() {
    const base = Base
    const mirror = base.mirrorHost()

    const environment = {
      ...NodeJS.environment
    }

    const node: any = {
      image: `${mirror}node:${NodeJS.version}`,
      ports: NodeJS.ports.map((p) => `${p.out}:${p.in}`),
      environment,
      networks: ['flyenv-network'],
      working_dir: '/app',
      command: NodeJS.command
    }

    if (NodeJS.wwwRoot) {
      const root = NodeJS.wwwRoot
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

export default NodeJS
