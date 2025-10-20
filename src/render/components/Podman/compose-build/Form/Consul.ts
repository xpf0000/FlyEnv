import { reactive } from 'vue'
import { fs } from '@/util/NodeFn'
import { dirname, join } from '@/util/path-browserify'
import { currentTimeZone } from '@/components/Podman/compose-build/Form/Base'
import base from './Base'

const Consul = reactive({
  enable: false,
  persistence: false,
  version: 'latest',
  ports: [
    { in: '8500', out: '8500' }, // Web UI
    { in: '8600', out: '8600', protocol: 'udp' } // DNS
  ],
  volumes: [
    {
      type: 'bind',
      source: './flyenv-docker-compose/consul/data',
      target: '/consul/data'
    }
  ],
  environment: {
    TZ: currentTimeZone,
    CONSUL_LOCAL_CONFIG: '{"datacenter": "dc1", "server": true, "bootstrap_expect": 1}',
    CONSUL_BIND_INTERFACE: 'eth0',
    CONSUL_CLIENT_INTERFACE: 'eth0'
  },
  check() {
    return ''
  },
  async build() {
    const mirror = base.mirrorHost()

    // 设置环境变量
    const environment = {
      ...Consul.environment
    }

    const consul: any = {
      image: `${mirror}consul:${Consul.version}`,
      ports: Consul.ports.map((p) => `${p.out}:${p.in}${p.protocol ? '/' + p.protocol : ''}`),
      environment,
      networks: ['flyenv-network'],
      command: 'agent -ui -client=0.0.0.0'
    }

    // 如果需要持久化数据，创建数据目录
    if (Consul.persistence) {
      consul.volumes = Consul.volumes
      await fs.mkdirp(join(dirname(base.dir), 'flyenv-docker-compose/consul/data'))
    }

    return {
      consul
    }
  }
})

export default Consul
