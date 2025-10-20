import { reactive } from 'vue'
import { fs } from '@/util/NodeFn'
import base, { currentTimeZone } from '@/components/Podman/compose-build/Form/Base'
import { OfficialImages } from '@/components/Podman/officialImages'
import { dirname, join } from '@/util/path-browserify'

// --- MinIO Configuration ---
const MinIO = reactive({
  enable: false,
  persistence: true,
  version: 'latest',
  ports: [
    { in: '9000', out: '9000' }, // API endpoint
    { in: '9001', out: '9001' } // Console UI
  ],
  volumes: [
    {
      type: 'bind',
      source: './flyenv-docker-compose/minio/data',
      target: '/data'
    }
  ],
  environment: {
    TZ: currentTimeZone,
    MINIO_ROOT_USER: 'minioadmin', // Default access key
    MINIO_ROOT_PASSWORD: 'minioadmin' // Default secret key
  },
  check() {
    return ''
  },
  async build() {
    const mirror = base.mirrorHost()
    const image = OfficialImages.etcd!.image

    const minio: any = {
      image: `${mirror}${image}:${MinIO.version}`,
      ports: MinIO.ports.map((p) => `${p.out}:${p.in}`),
      environment: MinIO.environment,
      networks: ['flyenv-network']
    }

    if (MinIO.persistence) {
      minio.volumes = MinIO.volumes
      await fs.mkdirp(join(dirname(base.dir), 'flyenv-docker-compose/minio/data'))
    }

    return { minio }
  }
})

export default MinIO
