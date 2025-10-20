import { reactive } from 'vue'
import { dirname, join, normalize } from '@/util/path-browserify'
import { fs } from '@/util/NodeFn'
import Base, { currentTimeZone } from '@/components/Podman/compose-build/Form/Base'
import { AppStore } from '@/store/app'

const Go = reactive({
  enable: false,
  version: 'latest',
  wwwRoot: '',
  ports: [{ in: '8080', out: '8080' }],
  environment: {
    TZ: currentTimeZone,
    CGO_ENABLED: '0',
    GOPROXY: 'https://goproxy.cn,direct',
    GOCACHE: '/go/pkg/cache'
  },
  command: '',
  check() {
    return ''
  },
  async build() {
    const base = Base
    const mirror = base.mirrorHost()

    const environment = {
      ...Go.environment
    }

    const store = AppStore()
    if (store.config.setup.lang !== 'zh') {
      environment.GOPROXY = ''
    }

    const goService: any = {
      image: `${mirror}golang:${Go.version}`,
      ports: Go.ports.map((p) => `${p.out}:${p.in}`),
      environment,
      networks: ['flyenv-network'],
      working_dir: '/app',
      command: Go.command
    }

    const volumes: any[] = []

    const flyenvGoDir = join(dirname(base.dir), 'flyenv-docker-compose/go')
    await fs.mkdirp(flyenvGoDir)

    const goCacheHostPath = join(flyenvGoDir, 'cache')
    await fs.mkdirp(goCacheHostPath)

    volumes.push({
      type: 'bind',
      source: goCacheHostPath,
      target: Go.environment.GOCACHE, // 映射到容器内的 GOCACHE 路径
      read_only: false
    })

    if (Go.wwwRoot) {
      const root = Go.wwwRoot
      volumes.push({
        type: 'bind',
        source: normalize(root),
        target: '/app',
        read_only: false
      })
    }

    goService.volumes = volumes

    return {
      go: goService
    }
  }
})

export default Go
