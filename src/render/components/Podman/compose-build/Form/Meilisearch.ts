import { reactive } from 'vue'
import { fs } from '@/util/NodeFn'
import base, { currentTimeZone } from '@/components/Podman/compose-build/Form/Base'
import { OfficialImages } from '@/components/Podman/officialImages'
import { dirname, join } from '@/util/path-browserify'

// --- Meilisearch Configuration ---
const Meilisearch = reactive({
  enable: false,
  persistence: true,
  version: 'latest',
  ports: [{ in: '7700', out: '7700' }],
  volumes: [
    {
      type: 'bind',
      source: './flyenv-docker-compose/meilisearch/data',
      target: '/data.ms'
    }
  ],
  environment: {
    TZ: currentTimeZone,
    MEILI_MASTER_KEY: 'meilisearch-master-key' // Required master key
  },
  check() {
    return ''
  },
  async build() {
    const mirror = base.mirrorHost()
    const image = OfficialImages.etcd!.image

    const meilisearch: any = {
      image: `${mirror}${image}:${Meilisearch.version}`,
      ports: Meilisearch.ports.map((p) => `${p.out}:${p.in}`),
      environment: Meilisearch.environment,
      networks: ['flyenv-network']
    }

    if (Meilisearch.persistence) {
      meilisearch.volumes = Meilisearch.volumes
      await fs.mkdirp(join(dirname(base.dir), 'flyenv-docker-compose/meilisearch/data'))
    }

    return { meilisearch }
  }
})

export default Meilisearch
