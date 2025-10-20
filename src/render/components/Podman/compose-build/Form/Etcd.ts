import { reactive } from 'vue'
import { fs } from '@/util/NodeFn'
import base, { currentTimeZone } from '@/components/Podman/compose-build/Form/Base'
import { OfficialImages } from '@/components/Podman/officialImages'
import { dirname, join } from '@/util/path-browserify'

// --- ETCD Configuration ---
export const Etcd = reactive({
  enable: false,
  persistence: false,
  version: 'latest',
  ports: [{ in: '2379', out: '2379' }],
  volumes: [
    {
      type: 'bind',
      source: './flyenv-docker-compose/etcd/data',
      target: '/var/lib/etcd'
    }
  ],
  environment: {
    TZ: currentTimeZone,
    // Simple single-node setup for local development
    ALLOW_NONE_AUTHENTICATION: 'yes',
    ETCD_LISTEN_CLIENT_URLS: 'http://0.0.0.0:2379',
    ETCD_ADVERTISE_CLIENT_URLS: 'http://0.0.0.0:2379'
  },
  check() {
    return ''
  },
  async build() {
    const mirror = base.mirrorHost()
    const image = OfficialImages.etcd!.image

    const etcd: any = {
      image: `${mirror}${image}:${Etcd.version}`,
      ports: Etcd.ports.map((p) => `${p.out}:${p.in}`),
      environment: Etcd.environment,
      networks: ['flyenv-network'],
      command: ['etcd']
    }

    if (Etcd.persistence) {
      etcd.volumes = Etcd.volumes
      await fs.mkdirp(join(dirname(base.dir), 'flyenv-docker-compose/etcd/data'))
    }

    return { etcd }
  }
})

export default Etcd
