import { reactive } from 'vue'
import { fs } from '@/util/NodeFn'
import base, { currentTimeZone } from '@/components/Podman/compose-build/Form/Base'
import Base from './Base'
import { OfficialImages } from '@/components/Podman/officialImages'
import { dirname, join } from '@/util/path-browserify'

// --- Redis Configuration ---
const Redis = reactive({
  enable: false,
  persistence: false,
  version: 'latest',
  ports: [{ in: '6379', out: '6379' }],
  volumes: [
    {
      type: 'bind',
      source: './flyenv-docker-compose/redis/data',
      target: '/data' // Redis persistence directory
    }
  ],
  environment: {
    TZ: currentTimeZone,
    REDIS_PASSWORD: ''
  },
  check() {
    return ''
  },
  async build() {
    const mirror = Base.mirrorHost()
    const image = OfficialImages.redis!.image
    const redis: any = {
      image: `${mirror}${image}:${Redis.version}`,
      ports: Redis.ports.map((p) => `${p.out}:${p.in}`),
      environment: Redis.environment,
      networks: ['flyenv-network']
    }

    if (Redis.persistence) {
      redis.volumes = Redis.volumes
      await fs.mkdirp(join(dirname(base.dir), 'flyenv-docker-compose/redis/data'))
    }

    return { redis }
  }
})

export default Redis
