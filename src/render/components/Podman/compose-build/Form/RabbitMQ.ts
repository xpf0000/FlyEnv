import { reactive } from 'vue'
import { fs } from '@/util/NodeFn'
import base, { currentTimeZone } from '@/components/Podman/compose-build/Form/Base'
import Base from './Base'
import { OfficialImages } from '@/components/Podman/officialImages'
import { dirname, join } from '@/util/path-browserify'

// --- RabbitMQ Configuration ---
export const RabbitMQ = reactive({
  enable: false,
  persistence: true,
  version: 'latest', // Use the image with management UI
  ports: [
    { in: '5672', out: '5672' }, // AMQP port
    { in: '15672', out: '15672' } // Management UI port
  ],
  volumes: [
    {
      type: 'bind',
      source: './flyenv-docker-compose/rabbitmq/data',
      target: '/var/lib/rabbitmq'
    }
  ],
  environment: {
    TZ: currentTimeZone,
    RABBITMQ_DEFAULT_USER: 'guest',
    RABBITMQ_DEFAULT_PASS: 'guest'
  },
  check() {
    return ''
  },
  async build() {
    const mirror = Base.mirrorHost()
    const image = OfficialImages.rabbitmq!.image
    const rabbitmq: any = {
      image: `${mirror}${image}:${RabbitMQ.version}`,
      ports: RabbitMQ.ports.map((p) => `${p.out}:${p.in}`),
      environment: RabbitMQ.environment,
      networks: ['flyenv-network']
    }

    if (RabbitMQ.persistence) {
      rabbitmq.volumes = RabbitMQ.volumes
      await fs.mkdirp(join(dirname(base.dir), 'flyenv-docker-compose/rabbitmq/data'))
    }

    return { rabbitmq }
  }
})

export default RabbitMQ
