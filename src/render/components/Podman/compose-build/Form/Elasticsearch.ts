import { reactive } from 'vue'
import { fs } from '@/util/NodeFn'
import base, { currentTimeZone } from '@/components/Podman/compose-build/Form/Base'
import { OfficialImages } from '@/components/Podman/officialImages'
import { dirname, join } from '@/util/path-browserify'

// --- Elasticsearch Configuration ---
const Elasticsearch = reactive({
  enable: false,
  persistence: true,
  version: 'latest', // Specify a common version; 'latest' might have compatibility issues
  ports: [
    { in: '9200', out: '9200' },
    { in: '9300', out: '9300' }
  ],
  volumes: [
    {
      type: 'bind',
      source: './flyenv-docker-compose/elasticsearch/data',
      target: '/usr/share/elasticsearch/data'
    }
  ],
  environment: {
    TZ: currentTimeZone,
    // Required for single-node development setup
    'discovery.type': 'single-node',
    // Set memory limits (critical for ES)
    ES_JAVA_OPTS: '-Xms512m -Xmx512m',
    // Bypass authentication for dev (optional, but common)
    'xpack.security.enabled': 'false'
  },
  check() {
    // Elasticsearch requires setting vm.max_map_count on the host machine. We note this in the check.
    return ''
  },
  async build() {
    const mirror = base.mirrorHost()
    const image = OfficialImages.etcd!.image

    const elasticsearch: any = {
      image: `${mirror}${image}:${Elasticsearch.version}`,
      ports: Elasticsearch.ports.map((p) => `${p.out}:${p.in}`),
      environment: Elasticsearch.environment,
      networks: ['flyenv-network'],
      // Set ulimits needed by ES
      ulimits: {
        memlock: { soft: -1, hard: -1 }
      }
    }

    if (Elasticsearch.persistence) {
      elasticsearch.volumes = Elasticsearch.volumes
      await fs.mkdirp(join(dirname(base.dir), 'flyenv-docker-compose/elasticsearch/data'))
    }

    return { elasticsearch }
  }
})

export default Elasticsearch
