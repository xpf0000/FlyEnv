import { reactive } from 'vue'
import base, { currentTimeZone } from '@/components/Podman/compose-build/Form/Base'
import { OfficialImages } from '@/components/Podman/officialImages'

// --- Memcached Configuration ---
export const Memcached = reactive({
  enable: false,
  version: 'latest',
  ports: [{ in: '11211', out: '11211' }],
  volumes: [],
  environment: {
    TZ: currentTimeZone
  },
  check() {
    return ''
  },
  async build() {
    const mirror = base.mirrorHost()
    const image = OfficialImages.memcached!.image

    const memcached: any = {
      image: `${mirror}${image}:${Memcached.version}`,
      ports: Memcached.ports.map((p) => `${p.out}:${p.in}`),
      environment: Memcached.environment,
      networks: ['flyenv-network']
    }
    // No persistence directory needed for Memcached

    return { memcached }
  }
})

export default Memcached
